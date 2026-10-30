import type { CreateUserInput } from "../types";
export const MIN_ACCOUNT_PASSWORD_LENGTH=12;
export function validateCreateUser(input:CreateUserInput):CreateUserInput {
  const name=input.name.trim(),email=input.email.trim().toLowerCase();
  if(name.length<2||name.length>120)throw new Error("Enter a user name of 2 to 120 characters.");
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error("Enter a valid email address.");
  if(!["Super Admin","Data Entry Staff"].includes(input.role))throw new Error("Choose Admin or Data Entry Staff.");
  if(typeof input.password!=="string"||input.password.length<MIN_ACCOUNT_PASSWORD_LENGTH)throw new Error("Password must contain at least 12 characters.");
  if(new TextEncoder().encode(input.password).length>72)throw new Error("Password must be no more than 72 bytes.");
  if(input.password!==input.confirmPassword)throw new Error("Passwords do not match.");
  return {...input,name,email};
}
