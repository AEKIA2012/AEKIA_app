import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ModuleShell from '../../components/ModuleShell'
import SaveConfirmation from '../../components/SaveConfirmation'
import { permissionImplies, useCurrentAccess } from '../../lib/accessControl'
import { supabase } from '../../lib/supabaseClient'

type Request = {
  id: string; first_names: string; paternal_last_name: string; maternal_last_name: string
  work_school_name: string; curp: string; email: string; status: string; admin_comment: string | null; created_at: string
}

export default function AdminRegistrationRequestsPage() {
  const navigate = useNavigate()
  const { permissions } = useCurrentAccess()
  const canEdit = permissionImplies(permissions, 'members.edit')
  const [rows, setRows] = useState<Request[]>([])
  const [memberEmails, setMemberEmails] = useState<Map<string,string>>(new Map())
  const [status, setStatus] = useState('pending')
  const [comments, setComments] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const {data,error:queryError} = await supabase.from('registration_requests')
      .select('id,first_names,paternal_last_name,maternal_last_name,work_school_name,curp,email,status,admin_comment,created_at')
      .eq('status',status).order('created_at',{ascending:false}).limit(250)
    if (queryError) {setError(queryError.message);setLoading(false);return}
    const nextRows = (data ?? []) as Request[]
    const {data:memberData,error:memberError} = nextRows.length > 0
      ? await supabase.from('members').select('curp,email,status').in('curp',nextRows.map((r)=>r.curp))
      : {data:[],error:null}
    if(memberError){setError(memberError.message);setLoading(false);return}
    setMemberEmails(new Map((memberData ?? []).filter((m)=>m.status==='active').map((m)=>[m.curp,(m.email??'').trim().toLowerCase()])))
    setRows(nextRows)
    setComments(Object.fromEntries(nextRows.map((r)=>[r.id,r.admin_comment??''])))
    setLoading(false)
  },[status])

  useEffect(()=>{
    const timer=window.setTimeout(()=>{void load()},0)
    return ()=>window.clearTimeout(timer)
  },[load])

  async function review(row:Request,nextStatus:'approved'|'rejected') {
    if(!canEdit)return
    if(nextStatus==='approved' && memberEmails.get(row.curp)!==row.email.trim().toLowerCase()) {
      setError('Revisa la ficha: el miembro debe estar activo y su correo debe coincidir antes de aprobar.');return
    }
    setBusy(row.id);setError('')
    const {error:reviewError}=await supabase.rpc('aekia_review_registration_request',{
      p_request_id:row.id,p_status:nextStatus,p_admin_comment:comments[row.id]??'',
    })
    setBusy('')
    if(reviewError){setError(reviewError.message);return}
    setSuccess(nextStatus==='approved'?'Solicitud aprobada. Ya puede activar su acceso.':'Solicitud rechazada.')
    await load()
  }

  return <ModuleShell title="Solicitudes de registro" subtitle="Altas pendientes y seguimiento" icon="/icons/icon-members.png" moduleType="Gestión" version="Registro v15">
    <SaveConfirmation message={success} onClose={()=>setSuccess(null)} />
    <label className="block text-sm text-slate-200">Estado
      <select value={status} onChange={(e)=>setStatus(e.target.value)} className="mt-2 w-full rounded-xl border border-white/20 bg-slate-900 p-3">
        <option value="pending">Pendientes</option><option value="approved">Aprobadas</option><option value="rejected">Rechazadas</option>
      </select>
    </label>
    {loading && <p className="text-sm text-slate-300">Cargando...</p>}
    {error && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-100">{error}</p>}
    {!loading && rows.length===0 && <p className="rounded-xl border border-white/10 p-4 text-sm text-slate-300">Sin solicitudes en este estado.</p>}
    <section className="space-y-3">
      {rows.map((r)=><article key={r.id} className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
        <div><p className="font-bold">{r.first_names} {r.paternal_last_name} {r.maternal_last_name}</p>
          <p className="mt-1 break-all text-xs text-slate-300">{r.email} · {r.curp}</p>
          <p className="mt-1 text-xs text-slate-400">Trabajo/escuela: {r.work_school_name} · {new Date(r.created_at).toLocaleDateString('es-MX')}</p>
        </div>
        {r.status==='pending' && !memberEmails.has(r.curp) && canEdit && <button type="button" onClick={()=>navigate('/admin/members/new',{state:{registrationRequest:r}})} className="w-full rounded-xl border border-cyan-400/30 bg-cyan-400/10 p-3 font-bold text-cyan-200">Completar alta de miembro</button>}
        {r.status==='pending' && memberEmails.has(r.curp) && <p className={`text-xs ${memberEmails.get(r.curp)===r.email.trim().toLowerCase()?'text-emerald-300':'text-amber-300'}`}>{memberEmails.get(r.curp)===r.email.trim().toLowerCase()?'Miembro localizado: correo coincidente':'Revisar correo de la ficha antes de aprobar'}</p>}
        <label className="block text-xs text-slate-300">Comentario administrativo
          <textarea value={comments[r.id]??''} onChange={(e)=>setComments((v)=>({...v,[r.id]:e.target.value}))} disabled={!canEdit || r.status!=='pending'} rows={2} className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 p-3 text-white" />
        </label>
        {r.status==='pending' && canEdit && <div className="grid grid-cols-2 gap-2">
          <button disabled={busy===r.id || memberEmails.get(r.curp)!==r.email.trim().toLowerCase()} onClick={()=>review(r,'approved')} className="rounded-xl bg-emerald-400 p-3 font-bold text-slate-950 disabled:opacity-40">Aprobar</button>
          <button disabled={busy===r.id} onClick={()=>review(r,'rejected')} className="rounded-xl border border-red-400/40 bg-red-400/10 p-3 font-bold text-red-200 disabled:opacity-40">Rechazar</button>
        </div>}
      </article>)}
    </section>
  </ModuleShell>
}
