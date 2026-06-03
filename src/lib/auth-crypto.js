const JWT_SECRET = process.env.JWT_SECRET || 'aasa-med-chem-super-secret-key-12345';

// Helper to convert string to Uint8Array buffer
function stringToBuffer(str) {
  return new TextEncoder().encode(str);
}

/**
 * Signs user payload into a session token string.
 * Format: userId:username:role:expiry:signature
 */
export async function signSession(payload) {
  const { userId, username, role } = payload;
  const expiry = Date.now() + 24 * 60 * 60 * 1000; // 24 hours expiry
  const messageStr = `${userId}:${username}:${role}:${expiry}`;
  
  const key = await crypto.subtle.importKey(
    'raw',
    stringToBuffer(JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    stringToBuffer(messageStr)
  );
  
  const signatureHex = Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
    
  return `${messageStr}:${signatureHex}`;
}

/**
 * Verifies session token signature and checks expiry.
 * Returns payload if valid, null otherwise.
 */
export async function verifySession(sessionToken) {
  if (!sessionToken) return null;
  
  try {
    const parts = sessionToken.split(':');
    if (parts.length !== 5) return null;
    
    const [userId, username, role, expiry, signatureHex] = parts;
    
    // Check expiry
    if (Date.now() > parseInt(expiry, 10)) {
      return null;
    }
    
    const messageStr = `${userId}:${username}:${role}:${expiry}`;
    
    const key = await crypto.subtle.importKey(
      'raw',
      stringToBuffer(JWT_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    
    const signatureBuffer = await crypto.subtle.sign(
      'HMAC',
      key,
      stringToBuffer(messageStr)
    );
    
    const expectedHex = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
      
    if (signatureHex !== expectedHex) {
      return null; // Signature mismatch
    }
    
    return {
      userId: parseInt(userId, 10),
      username,
      role
    };
  } catch (error) {
    console.error("verifySession error:", error);
    return null;
  }
}
