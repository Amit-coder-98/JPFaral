import { test } from "node:test";
import assert from "node:assert/strict";
import { createManageStaffHandler } from "../supabase/functions/_shared/manageStaff.ts";
const origin="https://jpfaral.test",password="Example@JPfaral";
const body={operation:"create",name:"Test staff",email:"staff@test.invalid",role:"staff",active:true,password,confirmPassword:password};
function fixture(role="super_admin",active=true,valid=true){
  const creates=[],profiles=[],deletes=[];
  const user={auth:{getUser:async()=>({data:{user:valid?{id:"caller"}:null},error:null})},
    from:()=>({select:()=>({eq:()=>({single:async()=>({data:{role,active,email:body.email},error:null})})})}),
    rpc:async(name,args)=>{profiles.push({name,args});return {error:null};}};
  const admin={auth:{admin:{createUser:async input=>{creates.push(input);return {data:{user:{id:"new-user"}},error:null};},
    deleteUser:async id=>{deletes.push(id);return {error:null};}}}};
  const handler=createManageStaffHandler({appOrigin:origin,userClient:()=>user,adminClient:()=>admin});
  const call=(input=body,token="valid",requestOrigin=origin)=>handler(new Request(origin+"/functions/manage-staff",{method:"POST",headers:{Origin:requestOrigin,"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{})},body:JSON.stringify(input)}));
  return {user,admin,call,creates,profiles,deletes,handler};
}
test("missing and invalid authentication never reaches privileged user creation",async()=>{
  const f=fixture();assert.equal((await f.call(body,null)).status,401);assert.equal(f.creates.length,0);
  const invalid=fixture("super_admin",true,false);assert.equal((await invalid.call()).status,401);assert.equal(invalid.creates.length,0);
});
test("staff and inactive administrators cannot create either role",async()=>{
  for(const role of ["staff","super_admin"])for(const f of [fixture("staff"),fixture("super_admin",false)]){
    assert.equal((await f.call({...body,role})).status,403);assert.equal(f.creates.length,0);assert.equal(f.profiles.length,0);
  }
});
test("an active administrator directly creates confirmed staff and admin accounts with the chosen role",async()=>{
  for(const role of ["staff","super_admin"]){
    const f=fixture(),response=await f.call({...body,role,name:" Test staff ",email:"STAFF@test.invalid"});
    assert.equal(response.status,201);assert.deepEqual(await response.json(),{id:"new-user",created:true});
    assert.deepEqual(f.creates,[{email:body.email,password,email_confirm:true,user_metadata:{full_name:"Test staff"}}]);
    assert.deepEqual(f.profiles,[{name:"admin_update_profile",args:{p_id:"new-user",p_name:" Test staff ",p_role:role,p_active:true}}]);
    assert.equal(f.deletes.length,0);
  }
});
test("invalid roles, missing fields and disabled new accounts are rejected before Auth administration",async()=>{
  for(const patch of [{role:"owner"},{role:null},{name:"A"},{email:"invalid"},{active:false},{active:null}]){
    const f=fixture();assert.equal((await f.call({...body,...patch})).status,400);assert.equal(f.creates.length,0);
  }
});
test("password presence, minimum length, byte limit and confirmation are checked server-side",async()=>{
  for(const patch of [{password:undefined},{password:123},{password:"short",confirmPassword:"short"},{password:"x".repeat(73),confirmPassword:"x".repeat(73)},
    {password:"界".repeat(25),confirmPassword:"界".repeat(25)},{confirmPassword:undefined},{confirmPassword:"Different@Password"}]){
    const f=fixture();const response=await f.call({...body,...patch});assert.equal(response.status,400);assert.equal(f.creates.length,0);
    assert.equal(JSON.stringify(await response.json()).includes(password),false);
  }
});
test("duplicate emails are a clear conflict and never replace passwords or roles on existing accounts",async()=>{
  const f=fixture();f.admin.auth.admin.createUser=async()=>({data:{user:null},error:{code:"email_exists",message:"Already registered"}});
  const response=await f.call();assert.equal(response.status,409);assert.match((await response.json()).error,/already has an account/);
  assert.equal(f.profiles.length,0);assert.equal(f.deletes.length,0);
});
test("Auth errors return safe messages without disclosing the submitted password",async()=>{
  for(const code of ["weak_password","unexpected"]){
    const f=fixture();f.admin.auth.admin.createUser=async()=>({data:{user:null},error:{code,message:password}});
    const response=await f.call();assert.equal(response.status,400);assert.equal(JSON.stringify(await response.json()).includes(password),false);
  }
});
test("a failed profile provisioning operation compensates by removing only the new Auth user",async()=>{
  const f=fixture();f.user.rpc=async()=>({error:{message:"Permission revoked"}});
  const response=await f.call();assert.equal(response.status,409);assert.deepEqual(f.deletes,["new-user"]);assert.match((await response.json()).error,/was removed/);
});
test("failed compensation is reported accurately instead of claiming the account was removed",async()=>{
  const f=fixture();f.user.rpc=async()=>({error:{message:"Permission revoked"}});f.admin.auth.admin.deleteUser=async()=>({error:{message:"Cleanup unavailable"}});
  const response=await f.call();assert.equal(response.status,409);assert.match((await response.json()).error,/cleanup did not finish/);
});
test("the invitation operation is retired and sends no invitation emails",async()=>{
  const f=fixture(),response=await f.call({...body,operation:"invite"});assert.equal(response.status,400);assert.match((await response.json()).error,/Create user/);
  assert.equal(f.creates.length,0);assert.equal(f.profiles.length,0);
});
test("existing profile updates use the checked database RPC without a password operation",async()=>{
  const f=fixture(),id="a1111111-1111-4111-8111-111111111111";
  assert.equal((await f.call({...body,operation:"update",id,role:"super_admin"})).status,200);
  assert.equal(f.creates.length,0);assert.equal(f.profiles[0].args.p_id,id);
  assert.equal((await f.call({...body,operation:"update",id,email:"someone@else.invalid"})).status,400);
});
test("production-origin preflights are allowed; other origins are blocked before privileged operations",async()=>{
  const f=fixture();const allowed=await f.handler(new Request(origin,{method:"OPTIONS",headers:{Origin:origin}}));
  assert.equal(allowed.status,204);assert.equal(allowed.headers.get("Access-Control-Allow-Origin"),origin);
  const denied=await f.call(body,"valid","https://untrusted.test");assert.equal(denied.status,403);assert.equal(denied.headers.get("Access-Control-Allow-Origin"),null);assert.equal(f.creates.length,0);
});
