import {describe,it,expect} from "vitest";
import {MockRepository} from "../../src/services/mockRepository";
import {validateCreateUser} from "../../src/utils/userAccounts";
const input=()=>({name:"New Staff",email:"new@test.invalid",role:"Data Entry Staff" as const,password:"Example@JPfaral",confirmPassword:"Example@JPfaral"});
describe("direct account creation",()=>{
  it("normalizes names and email and supports admin or staff with matching passwords",()=>{
    expect(validateCreateUser({...input(),name:" New Staff ",email:" NEW@test.invalid "})).toMatchObject({name:"New Staff",email:"new@test.invalid"});
    expect(validateCreateUser({...input(),role:"Super Admin"}).role).toBe("Super Admin");
  });
  it("rejects mismatched, short and oversized credentials and invalid identity details",()=>{
    for(const patch of [{name:"A"},{email:"invalid"},{password:"short",confirmPassword:"short"},{confirmPassword:"Different@JPfaral"},
      {password:"x".repeat(73),confirmPassword:"x".repeat(73)}])expect(()=>validateCreateUser({...input(),...patch})).toThrow();
  });
  it("creates active users only for an active administrator and never retains passwords in application state or audit logs",()=>{
    const r=new MockRepository(),before=r.getSnapshot().staff.length;
    expect(()=>r.createStaff(input(),"u2")).toThrow("Super Admin");
    r.createStaff(input(),"u1");
    expect(r.getSnapshot().staff).toHaveLength(before+1);expect(r.getSnapshot().staff.at(-1)).toMatchObject({email:"new@test.invalid",role:"Data Entry Staff",active:true});
    expect(JSON.stringify(r.getSnapshot())).not.toContain(input().password);
    expect(()=>r.createStaff(input(),"u1")).toThrow("already in use");
    r.createStaff({...input(),email:"admin@test.invalid",role:"Super Admin"},"u1");expect(r.getSnapshot().staff.at(-1)?.role).toBe("Super Admin");
  });
});
