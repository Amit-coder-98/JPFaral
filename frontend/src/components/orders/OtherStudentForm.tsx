import { useEffect, useRef, useState } from "react";
import { Search, UserPlus } from "lucide-react";
import { useApp } from "../../app/Provider";
import { Button, Field } from "../ui";
import type { Student } from "../../types";
import { isOtherStandard, normalizeStudentName, otherStandards, type OtherStudentInput } from "../../utils/otherStudents";

const blank = (): OtherStudentInput => ({name:"",standard:"",division:"",phone:""});
export function OtherStudentForm({selected,onSelect,onClear}:{selected?:Student;onSelect:(student:Student)=>void;onClear:()=>void}) {
  const {data,repository,user,toast} = useApp();
  const [form,setForm] = useState<OtherStudentInput>(()=>selected ? {...selected} : blank());
  const [open,setOpen] = useState(false), [index,setIndex] = useState(0), [busy,setBusy] = useState(false), [error,setError] = useState("");
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const query = normalizeStudentName(form.name).toLocaleLowerCase();
  const matches = data.students.filter(student=>isOtherStandard(student.standard)
    && query && normalizeStudentName(student.name).toLocaleLowerCase().includes(query)).slice(0,10);
  const change = (key:keyof OtherStudentInput,value:string) => {
    if (selected) onClear();
    setForm(current=>({...current,[key]:value})); setError("");
  };
  const choose = (student:Student) => { setForm({...student});setOpen(false);setError("");onSelect(student); };
  const save = async () => {
    if(busy) return;
    setBusy(true);setError("");
    try { const saved=await repository.saveOtherStudent(form,user!.id);if(mounted.current) {choose(saved);toast("Student saved and selected. Reuse this student for their next order.");} }
    catch(error) {if(mounted.current) setError(error instanceof Error ? error.message : "Unable to save student.");}
    finally {if(mounted.current) setBusy(false);}
  };
  return <div className="other-student-form">
    <p className="muted">For 1st–4th standard. Type a name to find a saved student, or enter new details and save. The student phone and division are optional.</p>
    <div className="autocomplete">
      <Field label="Others student name" required>
        <div className="search-input"><Search size={17}/><input role="combobox" aria-expanded={open && !!query} aria-controls="other-student-options"
          aria-autocomplete="list" aria-activedescendant={open && matches[index] ? `other-${matches[index].id}` : undefined}
          value={form.name} maxLength={120} placeholder="Type the student's full name…" disabled={busy}
          onFocus={()=>setOpen(true)} onBlur={()=>setTimeout(()=>setOpen(false),150)}
          onChange={event=>{change("name",event.target.value);setOpen(true);setIndex(0);}}
          onKeyDown={event=>{
            if(event.key === "ArrowDown" || event.key === "ArrowUp") {event.preventDefault();setOpen(true);setIndex(current=>Math.max(0,Math.min(matches.length-1,current+(event.key==="ArrowDown"?1:-1))));}
            if(event.key === "Enter" && open && matches[index]) {event.preventDefault();choose(matches[index]);}
            if(event.key === "Escape") setOpen(false);
          }}/></div>
      </Field>
      {open && query && <div role="listbox" id="other-student-options" className="autocomplete-options">
        {matches.length ? matches.map((student,i)=><button type="button" role="option" id={`other-${student.id}`} key={student.id}
          aria-selected={index===i} onMouseDown={event=>event.preventDefault()} onClick={()=>choose(student)}>
          <span><strong>{student.name}</strong><small>{student.phone || "No student phone"}</small></span>
          <span>{student.standard}{student.division ? ` · ${student.division}` : ""}</span>
        </button>) : <p>No saved student found. Complete the details below and save.</p>}
      </div>}
    </div>
    <div className="form-grid">
      <Field label="Others standard" required><select value={form.standard} disabled={busy} onChange={event=>change("standard",event.target.value)}>
        <option value="">Select standard</option>{otherStandards.map(standard=><option key={standard}>{standard}</option>)}
      </select></Field>
      <Field label="Others division (optional)"><input value={form.division} disabled={busy} maxLength={60} placeholder="e.g. A, B or division name" onChange={event=>change("division",event.target.value)}/></Field>
      <Field label="Student phone (optional)" hint="Leave blank if unavailable. The order still needs a customer phone.">
        <input inputMode="numeric" value={form.phone} disabled={busy} maxLength={10} placeholder="10-digit phone, if available" onChange={event=>change("phone",event.target.value)}/>
      </Field>
    </div>
    {error && <p className="field-error" role="alert">{error}</p>}
    {!selected && <Button variant="secondary" loading={busy} onClick={()=>void save()}><UserPlus size={16}/>Save student & use</Button>}
    {selected && <p className="text-green" role="status">Saved student selected. Their next order can use the same name search.</p>}
  </div>;
}
