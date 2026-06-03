import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { verifySession } from '@/lib/auth-crypto';
import { convertQuantity } from '@/lib/conversions';

// GET: Fetch orders (Admin sees all; Seller sees their own)
export async function GET(request) {
  const sessionCookie = request.cookies.get('session');
  const sessionToken = sessionCookie?.value;
  const user = await verifySession(sessionToken);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let rows;
    if (user.role === 'admin') {
      rows = await sql`
        SELECT 
          o.id AS order_id,
          o.seller_id,
          o.seller_name,
          o.status,
          o.total_price,
          o.created_at,
          oi.id AS item_id,
          oi.product_id,
          oi.product_name,
          oi.ordered_quantity,
          oi.ordered_unit,
          oi.converted_quantity,
          oi.base_unit,
          oi.price_per_base_unit,
          oi.item_total_price
        FROM orders o
        JOIN order_items oi ON o.id = oi.order_id
        ORDER BY o.created_at DESC, o.id DESC
      `;
    } else {
      rows = await sql`
        SELECT 
          o.id AS order_id,
          o.seller_id,
          o.seller_name,
          o.status,
          o.total_price,
          o.created_at,
          oi.id AS item_id,
          oi.product_id,
          oi.product_name,
          oi.ordered_quantity,
          oi.ordered_unit,
          oi.converted_quantity,
          oi.base_unit,
          oi.price_per_base_unit,
          oi.item_total_price
        FROM orders o
        JOIN order_items oi ON o.id = oi.order_id
        WHERE o.seller_id = ${user.userId}
        ORDER BY o.created_at DESC, o.id DESC
      `;
    }

    // Group items by order
    const ordersMap = {};
    for (const row of rows) {
      if (!ordersMap[row.order_id]) {
        ordersMap[row.order_id] = {
          id: row.order_id,
          sellerId: row.seller_id,
          sellerName: row.seller_name,
          status: row.status,
          totalPrice: parseFloat(row.total_price),
          createdAt: row.created_at,
          items: []
        };
      }
      ordersMap[row.order_id].items.push({
        id: row.item_id,
        productId: row.product_id,
        productName: row.product_name,
        orderedQuantity: parseFloat(row.ordered_quantity),
        orderedUnit: row.ordered_unit,
        convertedQuantity: parseFloat(row.converted_quantity),
        baseUnit: row.base_unit,
        pricePerBaseUnit: parseFloat(row.price_per_base_unit),
        itemTotalPrice: parseFloat(row.item_total_price)
      });
    }

    const orders = Object.values(ordersMap).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return NextResponse.json({ orders }, { status: 200 });
  } catch (error) {
    console.error("GET orders error:", error);
    return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 });
  }
}

// POST: Place a new order/quotation (Seller only)
export async function POST(request) {
  const sessionCookie = request.cookies.get('session');
  const sessionToken = sessionCookie?.value;
  const user = await verifySession(sessionToken);

  if (!user || user.role !== 'seller') {
    return NextResponse.json({ error: "Unauthorized: Sellers only" }, { status: 403 });
  }

  try {
    const { items } = await request.json();

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Order must contain at least one item" }, { status: 400 });
    }

    // Fetch products involved to validate details
    const productIds = items.map(item => item.productId);
    const dbProducts = await sql`
      SELECT * FROM products WHERE id = ANY(${productIds})
    `;
    const productsMap = {};
    for (const p of dbProducts) {
      productsMap[p.id] = p;
    }

    // 1. Validate all items and calculate totals first
    const validatedItems = [];
    let orderTotalPrice = 0;

    for (const item of items) {
      const product = productsMap[item.productId];
      if (!product) {
        return NextResponse.json({ error: `Product with ID ${item.productId} not found` }, { status: 400 });
      }

      const qty = parseFloat(item.orderedQuantity);
      if (isNaN(qty) || qty <= 0) {
        return NextResponse.json({ error: `Invalid quantity for product ${product.name}` }, { status: 400 });
      }

      // Convert quantity to base unit
      let convertedQty;
      try {
        convertedQty = convertQuantity(qty, item.orderedUnit, product.base_unit, product.dimension);
      } catch (err) {
        return NextResponse.json({ error: `Conversion error for ${product.name}: ${err.message}` }, { status: 400 });
      }

      // Check inventory
      const currentInventory = parseFloat(product.inventory);
      if (convertedQty > currentInventory) {
        return NextResponse.json({ 
          error: `Insufficient inventory for ${product.name}. Requested: ${qty} ${item.orderedUnit} (${convertedQty.toFixed(4)} ${product.base_unit}), Available: ${currentInventory.toFixed(4)} ${product.base_unit}` 
        }, { status: 400 });
      }

      // Calculate price
      const pricePerBase = parseFloat(product.base_price);
      const itemTotalPrice = convertedQty * pricePerBase;
      orderTotalPrice += itemTotalPrice;

      validatedItems.push({
        product,
        orderedQuantity: qty,
        orderedUnit: item.orderedUnit,
        convertedQuantity: convertedQty,
        baseUnit: product.base_unit,
        pricePerBaseUnit: pricePerBase,
        itemTotalPrice
      });
    }

    // 2. Perform DB writes sequentially
    // Insert parent Order
    const orderResult = await sql`
      INSERT INTO orders (seller_id, seller_name, total_price, status)
      VALUES (${user.userId}, ${user.username}, ${orderTotalPrice}, 'pending')
      RETURNING id
    `;
    const orderId = orderResult[0].id;

    // Insert Order Items and Update Inventory
    for (const val of validatedItems) {
      await sql`
        INSERT INTO order_items (
          order_id, product_id, product_name, ordered_quantity, ordered_unit, 
          converted_quantity, base_unit, price_per_base_unit, item_total_price
        ) VALUES (
          ${orderId}, ${val.product.id}, ${val.product.name}, ${val.orderedQuantity}, ${val.orderedUnit},
          ${val.convertedQuantity}, ${val.baseUnit}, ${val.pricePerBaseUnit}, ${val.itemTotalPrice}
        )
      `;

      // Deduct inventory
      const newInventory = parseFloat(val.product.inventory) - val.convertedQuantity;
      await sql`
        UPDATE products 
        SET inventory = ${newInventory}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${val.product.id}
      `;
    }

    return NextResponse.json({ success: true, orderId, totalPrice: orderTotalPrice }, { status: 201 });
  } catch (error) {
    console.error("POST order placement error:", error);
    return NextResponse.json({ error: "Failed to place order" }, { status: 500 });
  }
}
