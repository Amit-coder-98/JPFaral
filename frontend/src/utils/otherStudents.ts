import type { Student } from "../types";
export const otherStandards = ["1st", "2nd", "3rd", "4th"] as const;
export const isOtherStandard = (standard?: string) => otherStandards.some(value => value === standard);
export const normalizeStudentName = (name: string) => name.trim().replace(/\s+/g, " ");
export type OtherStudentInput = Omit<Student, "id">;
export function validateOtherStudent(input: OtherStudentInput) {
  const value = {...input,name:normalizeStudentName(input.name),division:input.division.trim(),phone:input.phone.trim()};
  if (!isOtherStandard(value.standard)) throw new Error("Choose a standard from 1st to 4th.");
  if (value.name.length < 2 || value.name.length > 120) throw new Error("Enter a student name of 2 to 120 characters.");
  if (value.division.length > 60) throw new Error("Division must be at most 60 characters.");
  if (value.phone && !/^\d{10}$/.test(value.phone)) throw new Error("Student phone must have 10 digits when provided.");
  return value;
}
