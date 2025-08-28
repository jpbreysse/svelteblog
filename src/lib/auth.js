
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '$env/static/private'; 
// Removed: import { dev } from '$app/environment';  <- We don't need this anymore


console.log('🔍 AUTH.JS - NODE_ENV:', process.env.NODE_ENV);
console.log('🔍 AUTH.JS - JWT_SECRET length:', process.env.JWT_SECRET?.length);
console.log('🔍 AUTH.JS - JWT_SECRET first 10 chars:', process.env.JWT_SECRET?.substring(0, 10));


// Always use environment variable (no more dev vs production logic)
// const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters long');
}


export async function hashPassword(password) {
  try {
    return await bcrypt.hash(password, 10);
  } catch (error) {
    console.error('Error hashing password:', error);
    throw new Error('Password hashing failed');
  }
}

export async function verifyPassword(password, hash) {
  try {
    return await bcrypt.compare(password, hash);
  } catch (error) {
    console.error('Error verifying password:', error);
    return false;
  }
}

export function createToken(user) {
  try {
    return jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        role: user.role,
        status: user.status 
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
  } catch (error) {
    console.error('Error creating token:', error);
    throw new Error('Token creation failed');
  }
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    console.error('Error verifying token:', error);
    return null;
  }
}