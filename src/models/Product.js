export class Product {
  constructor({ id, name, sku, description, category, dimension, base_unit, base_price, inventory, created_at, updated_at }) {
    this.id = id;
    this.name = name;
    this.sku = sku;
    this.description = description;
    this.category = category;
    this.dimension = dimension;
    this.base_unit = base_unit;
    this.base_price = base_price;
    this.inventory = inventory;
    this.created_at = created_at;
    this.updated_at = updated_at;
  }

  /**
   * Validates product constraints like dimensions, units, rates, and stock values.
   */
  static validate(productData) {
    const { name, sku, dimension, base_unit, base_price, inventory } = productData;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      throw new Error("Product name must be a valid non-empty string");
    }
    if (!sku || typeof sku !== 'string' || sku.trim() === '') {
      throw new Error("SKU must be a valid non-empty string");
    }
    if (!dimension || !['weight', 'volume', 'count'].includes(dimension)) {
      throw new Error("Dimension must be weight, volume, or count");
    }

    const validUnits = {
      weight: ['g', 'kg'],
      volume: ['mL', 'L'],
      count: ['items']
    };

    if (!validUnits[dimension] || !validUnits[dimension].includes(base_unit)) {
      throw new Error(`Invalid unit '${base_unit}' for dimension '${dimension}'. Valid options: ${validUnits[dimension].join(', ')}`);
    }

    const price = parseFloat(base_price);
    const stock = parseFloat(inventory);

    if (isNaN(price) || price < 0) {
      throw new Error("Base price must be a valid positive number");
    }
    if (isNaN(stock) || stock < 0) {
      throw new Error("Inventory must be a valid non-negative number");
    }

    return true;
  }
}
