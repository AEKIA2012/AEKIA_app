import { useCallback, useEffect, useMemo, useState } from 'react'
import ModuleShell from '../../components/ModuleShell'
import SaveConfirmation from '../../components/SaveConfirmation'
import { permissionImplies, useCurrentAccess } from '../../lib/accessControl'
import { supabase } from '../../lib/supabaseClient'

type Member = {id:string;first_names:string;paternal_last_name:string;maternal_last_name:string;birth_date:string|null}
type Relation = {id:string;guardian_member_id:string;minor_member_id:string;relationship_type:string;status:string;can_view_data:boolean;can_view_payments:boolean;can_register_events:boolean}
const nameOf=(m:Member)=>[m.first_names,m.paternal_last_name,m.maternal_last_name==='.'?'':m.maternal_last_name].filter(Boolean).join(' ')

export default function AdminGuardiansPage(){
  const {permissions}=useCurrentAccess()
  const canEdit=permissionImplies(permissions,'members.edit')
  const [members,setMembers]=useState<Member[]>([])
  const [relations,setRelations]=useState<Relation[]>([])
  const [guardianId,setGuardianId]=useState('')
  const [minorId,setMinorId]=useState('')
  const [relationType,setRelationType]=useState('Padre/Madre')
  const [canViewData,setCanViewData]=useState(true)
  const [canViewPayments,setCanViewPayments]=useState(true)
  const [canRegisterEvents,setCanRegisterEvents]=useState(true)
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')
  const [success,setSuccess]=useState<string|null>(null)

  const load=useCallback(async()=>{
    const [{data:people,error:peopleError},{data:links,error:linksError}]=await Promise.all([
      supabase.from('members').select('id,first_names,paternal_last_name,maternal_last_name,birth_date').eq('status','active').order('paternal_last_name'),
      supabase.from('member_guardians').select('id,guardian_member_id,minor_member_id,relationship_type,status,can_view_data,can_view_payments,can_register_events'),
    ])
    if(peopleError||linksError){setError(peopleError?.message??linksError?.message??'Error de consulta');return}
    setMembers((people??[]) as Member[]);setRelations((links??[]) as Relation[])
  },[])
  useEffect(()=>{
    const timer=window.setTimeout(()=>{void load()},0)
    return ()=>window.clearTimeout(timer)
  },[load])

  const minors=useMemo(()=>members.filter((m)=>{
    if(!m.birth_date)return false
    const bd=new Date(`${m.birth_date}T00:00:00`)
    const eighteen=new Date(bd);eighteen.setFullYear(bd.getFullYear()+18)
    return eighteen>new Date()
  }),[members])
  const selected=relations.filter((r)=>r.minor_member_id===minorId)

  async function saveLink(){
    if(!canEdit||!minorId||!guardianId){setError('Selecciona padre/madre e hijo/a.');return}
    if(minorId===guardianId){setError('No puede ser su propio tutor.');return}
    setSaving(true);setError('')
    const {error:saveError}=await supabase.from('member_guardians').upsert({
      minor_member_id:minorId,guardian_member_id:guardianId,relationship_type:relationType,
      can_view_data:canViewData,can_view_payments:canViewPayments,
      can_register_events:canRegisterEvents,can_update_data:false,status:'active',
    },{onConflict:'minor_member_id,guardian_member_id'})
    setSaving(false)
    if(saveError){setError(saveError.message);return}
    setSuccess('Vínculo familiar guardado.');await load()
  }

  async function toggleLink(link:Relation){
    if(!canEdit)return
    setSaving(true);setError('')
    const {error:updateError}=await supabase.from('member_guardians').update({status:link.status==='active'?'inactive':'active'}).eq('id',link.id)
    setSaving(false)
    if(updateError){setError(updateError.message);return}
    setSuccess('Estado del vínculo actualizado.');await load()
  }

  return <ModuleShell title="Familia y tutores" subtitle="Vínculos entre integrantes" icon="/icons/icon-members.png" moduleType="Gestión" version="Familia v15">
    <SaveConfirmation message={success} onClose={()=>setSuccess(null)}/>
    {error && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
    <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
      <label className="block">Hijo o hija menor de edad
        <select value={minorId} onChange={(e)=>setMinorId(e.target.value)} className="mt-2 w-full rounded-xl border border-white/15 bg-slate-900 p-3">
          <option value="">Seleccionar</option>{minors.map((m)=><option key={m.id} value={m.id}>{nameOf(m)}</option>)}
        </select>
      </label>
      <label className="block">Padre, madre o tutor
        <select value={guardianId} onChange={(e)=>setGuardianId(e.target.value)} className="mt-2 w-full rounded-xl border border-white/15 bg-slate-900 p-3">
          <option value="">Seleccionar</option>{members.filter((m)=>m.id!==minorId).map((m)=><option key={m.id} value={m.id}>{nameOf(m)}</option>)}
        </select>
      </label>
      <label className="block">Relación
        <select value={relationType} onChange={(e)=>setRelationType(e.target.value)} className="mt-2 w-full rounded-xl border border-white/15 bg-slate-900 p-3">
          <option value="Padre/Madre">Padre / Madre</option><option value="Tutor legal">Tutor legal</option><option value="Familiar responsable">Familiar responsable</option>
        </select>
      </label>
      <div className="space-y-2 rounded-xl border border-white/10 p-3">
        <p className="text-xs font-semibold text-slate-300">Permisos del tutor</p>
        <label className="flex items-center gap-3"><input type="checkbox" checked={canViewData} onChange={(e)=>setCanViewData(e.target.checked)} /> Ver información y asistencia</label>
        <label className="flex items-center gap-3"><input type="checkbox" checked={canViewPayments} onChange={(e)=>setCanViewPayments(e.target.checked)} /> Consultar pagos</label>
        <label className="flex items-center gap-3"><input type="checkbox" checked={canRegisterEvents} onChange={(e)=>setCanRegisterEvents(e.target.checked)} /> Registrar en eventos</label>
      </div>
      {canEdit && <button onClick={saveLink} disabled={saving} className="w-full rounded-xl bg-cyan-400 p-3 font-bold text-slate-950 disabled:opacity-50">Guardar vínculo</button>}
    </section>
    {minorId && <section className="space-y-3">
      <h2 className="text-sm font-bold">Tutores vinculados</h2>
      {selected.length===0 && <p className="text-sm text-slate-400">Sin tutores vinculados.</p>}
      {selected.map((link)=><article key={link.id} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
        <p className="font-semibold">{nameOf(members.find((m)=>m.id===link.guardian_member_id)??{id:'',first_names:'Tutor',paternal_last_name:'',maternal_last_name:'',birth_date:null})}</p>
        <p className="mt-1 text-xs text-slate-400">{link.relationship_type} · {link.status==='active'?'Activo':'Inactivo'}</p>
        <p className="mt-1 text-xs text-slate-400">Información: {link.can_view_data?'Sí':'No'} · Pagos: {link.can_view_payments?'Sí':'No'} · Eventos: {link.can_register_events?'Sí':'No'}</p>
        {canEdit && <button onClick={()=>toggleLink(link)} disabled={saving} className="mt-3 rounded-xl border border-cyan-400/30 px-3 py-2 text-xs font-bold text-cyan-200">{link.status==='active'?'Desactivar vínculo':'Reactivar vínculo'}</button>}
      </article>)}
    </section>}
  </ModuleShell>
}
