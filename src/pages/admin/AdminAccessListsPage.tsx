import { useEffect, useMemo, useState } from 'react'
import ModuleShell from '../../components/ModuleShell'
import SaveConfirmation from '../../components/SaveConfirmation'
import { Field, ModalPanel, PrimaryButton, SecondaryButton, SelectField, StatusBadge } from '../../components/FormControls'
import { permissionImplies, useCurrentAccess } from '../../lib/accessControl'
import { supabase } from '../../lib/supabaseClient'
import { fullName, sanitizeFilename } from '../../lib/helpers'

type AccessListRow = { id: string; name: string; day_type: string; status: string }
type MemberOptionRow = { id: string; first_names: string; paternal_last_name: string; maternal_last_name: string; japanese_name: string | null; work_school_name: string | null; gender: string | null }
type AccessMemberRow = { id: string; member_id: string; japanese_name_snapshot: string | null; work_school_name_snapshot: string | null; sort_order: number | null; members: MemberOptionRow | null }
type ExternalPersonRow = { id: string; full_name: string; japanese_name: string | null; work_school_name: string | null; status: string; sort_order: number | null }

type CopyState = { source: AccessListRow; newName: string } | null

function xmlEscape(value: string | number | null | undefined) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function cell(
  value: string | number | null | undefined,
  styleId = 'normal',
  opts: { mergeAcross?: number; mergeDown?: number; index?: number } = {},
) {
  const index = opts.index ? ` ss:Index="${opts.index}"` : ''
  const mergeAcross = opts.mergeAcross && opts.mergeAcross > 0 ? ` ss:MergeAcross="${opts.mergeAcross}"` : ''
  const mergeDown = opts.mergeDown && opts.mergeDown > 0 ? ` ss:MergeDown="${opts.mergeDown}"` : ''
  return `<Cell ss:StyleID="${styleId}"${index}${mergeAcross}${mergeDown}><Data ss:Type="String">${xmlEscape(value)}</Data></Cell>`
}

function row(cells: string, height = 18) {
  return `<Row ss:Height="${height}">${cells}</Row>`
}

function downloadExcelXml(filename: string, xml: string) {
  const blob = new Blob([xml], { type: 'application/xml;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${sanitizeFilename(filename)}.xml`
  link.click()
  URL.revokeObjectURL(url)
}

function genderEs(member: MemberOptionRow | null) {
  const gender = String(member?.gender ?? '').toLowerCase()
  if (gender.includes('fem') || gender === 'f') return '(F)'
  if (gender.includes('mas') || gender === 'm') return '(M)'
  return ''
}

function genderJp(member: MemberOptionRow | null) {
  const gender = String(member?.gender ?? '').toLowerCase()
  if (gender.includes('fem') || gender === 'f') return '（女）'
  if (gender.includes('mas') || gender === 'm') return '（男）'
  return ''
}

function exportJapaneseAccessList(list: AccessListRow, members: AccessMemberRow[], externalPeople: ExternalPersonRow[]) {
  const today = new Date().toLocaleDateString('es-MX')
  const allRows = [
    ...members.map((item) => ({
      name: fullName(item.members ?? {}),
      japanese: item.japanese_name_snapshot ?? item.members?.japanese_name ?? '',
      genderEs: genderEs(item.members),
      genderJp: genderJp(item.members),
      work: item.work_school_name_snapshot ?? item.members?.work_school_name ?? '',
      workJp: item.work_school_name_snapshot ?? item.members?.work_school_name ?? '',
    })),
    ...externalPeople.map((item) => ({
      name: item.full_name,
      japanese: item.japanese_name ?? '',
      genderEs: '',
      genderJp: '',
      work: item.work_school_name ?? '',
      workJp: item.work_school_name ?? '',
    })),
  ]

  const participantRows = allRows.map((item, index) => {
    const n = index + 1
    return [
      row(
        cell(n, 'number', { index: 2, mergeDown: 5 }) +
          cell(item.name, 'yellowLeft', { mergeDown: 1 }) +
          cell(item.genderEs, 'yellowCenter', { mergeDown: 1 }) +
          cell(item.work, 'yellowCenter', { mergeAcross: 3, mergeDown: 1 }) +
          cell('', 'sign', { mergeDown: 5 }) +
          cell('', 'sign', { mergeDown: 5 }) +
          cell('', 'sign', { mergeDown: 5 }) +
          cell('', 'sign', { mergeDown: 5 }),
        12,
      ),
      row('', 12),
      row(
        cell(item.japanese, 'cyanLeft', { index: 3, mergeDown: 3 }) +
          cell(item.genderJp, 'cyanCenter', { mergeDown: 3 }) +
          cell(item.workJp, 'cyanCenter', { mergeAcross: 3, mergeDown: 3 }),
        12,
      ),
      row('', 12),
      row('', 12),
      row('', 12),
    ].join('\n')
  }).join('\n')

  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office"><Author>AEKIA App</Author></DocumentProperties>
 <Styles>
  <Style ss:ID="blank"><Font ss:FontName="Arial" ss:Size="9"/></Style>
  <Style ss:ID="normal"><Font ss:FontName="Arial" ss:Size="9"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders><Alignment ss:Vertical="Center" ss:WrapText="1"/></Style>
  <Style ss:ID="topBlue"><Font ss:FontName="Arial" ss:Size="11" ss:Bold="1"/><Interior ss:Color="#DDEBF7" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders><Alignment ss:Vertical="Center" ss:WrapText="1"/></Style>
  <Style ss:ID="cyanHeader"><Font ss:FontName="Yu Gothic" ss:Size="18"/><Interior ss:Color="#CCFFFF" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/></Style>
  <Style ss:ID="yellowHeader"><Font ss:FontName="Arial" ss:Size="11" ss:Bold="1"/><Interior ss:Color="#FFFF00" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/></Style>
  <Style ss:ID="blueHeader"><Font ss:FontName="Yu Gothic" ss:Size="12"/><Interior ss:Color="#CCFFFF" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/></Style>
  <Style ss:ID="number"><Font ss:FontName="Arial" ss:Size="9"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders><Alignment ss:Horizontal="Center" ss:Vertical="Center"/></Style>
  <Style ss:ID="yellowLeft"><Font ss:FontName="Arial" ss:Size="9"/><Interior ss:Color="#FFFF00" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders><Alignment ss:Vertical="Center" ss:WrapText="1"/></Style>
  <Style ss:ID="yellowCenter"><Font ss:FontName="Arial" ss:Size="9"/><Interior ss:Color="#FFFF00" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/></Style>
  <Style ss:ID="cyanLeft"><Font ss:FontName="Yu Gothic" ss:Size="9"/><Interior ss:Color="#CCFFFF" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders><Alignment ss:Vertical="Center" ss:WrapText="1"/></Style>
  <Style ss:ID="cyanCenter"><Font ss:FontName="Yu Gothic" ss:Size="9"/><Interior ss:Color="#CCFFFF" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/></Style>
  <Style ss:ID="sign"><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders><Alignment ss:Vertical="Center"/></Style>
 </Styles>
 <Worksheet ss:Name="${xmlEscape(list.name).slice(0, 31)}">
  <Table>
   <Column ss:Width="16"/>
   <Column ss:Width="35"/>
   <Column ss:Width="230"/>
   <Column ss:Width="45"/>
   <Column ss:Width="72"/>
   <Column ss:Width="105"/>
   <Column ss:Width="50"/>
   <Column ss:Width="72"/>
   <Column ss:Width="112"/>
   <Column ss:Width="112"/>
   <Column ss:Width="112"/>
   <Column ss:Width="112"/>
   ${row(cell('Recepción de visitas externas y lista de chequeo', 'topBlue', { index: 2, mergeAcross: 6 }) + cell('Fecha / 日付', 'normal') + cell(today, 'normal', { mergeAcross: 3 }), 24)}
   ${row(cell('学校開放受付&チェックリスト', 'topBlue', { index: 2, mergeAcross: 6 }) + cell(`Lista: ${list.name}`, 'normal', { mergeAcross: 3 }), 24)}
   ${row(cell('El nombre de grupo externos: AGS KenyuKai (Kendo)   Representante: Yasuhiro Shimizu / Luis Carlos Aguilar García / Juan Carlos Amador Robles', 'normal', { index: 2, mergeAcross: 10 }), 24)}
   ${row(cell('Numero de participantes', 'normal', { index: 2, mergeAcross: 6 }) + cell('check de limpieza', 'normal', { mergeAcross: 1 }) + cell('check de Instalacion y equipos', 'normal', { mergeAcross: 1 }), 24)}
   ${row(cell(`利用者数                         名`, 'cyanHeader', { index: 2, mergeAcross: 1 }) + cell(`${allRows.length}名`, 'cyanHeader', { mergeAcross: 4 }) + cell('清掃チェック', 'cyanHeader', { mergeAcross: 1 }) + cell('施設設備破損チェック', 'cyanHeader', { mergeAcross: 1 }), 42)}
   ${row(cell('', 'yellowHeader', { index: 2, mergeDown: 2 }) + cell('Nombre de los participantes', 'yellowHeader') + cell('sexo', 'yellowHeader') + cell('Nombre de empresa\no escuela', 'yellowHeader', { mergeAcross: 3 }) + cell('Firma', 'yellowHeader') + cell('Hora de\nentrada', 'yellowHeader') + cell('Firma', 'yellowHeader') + cell('Hora de\nsalida', 'yellowHeader'), 40)}
   ${row(cell('参加者氏名', 'blueHeader', { index: 3, mergeDown: 1 }) + cell('性別', 'blueHeader', { mergeDown: 1 }) + cell('参加者の企業名、学校名', 'blueHeader', { mergeAcross: 3, mergeDown: 1 }) + cell('入場時サイン', 'blueHeader') + cell('入場時刻', 'blueHeader') + cell('退場時サイン', 'blueHeader') + cell('退場時刻', 'blueHeader'), 24)}
   ${row('', 12)}
   ${participantRows}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><PageSetup><Layout x:Orientation="Landscape"/></PageSetup><FitToPage/><Print><FitWidth>1</FitWidth><FitHeight>0</FitHeight></Print></WorksheetOptions>
 </Worksheet>
</Workbook>`

  downloadExcelXml(list.name, xml)
}

export default function AdminAccessListsPage() {
  const { permissions } = useCurrentAccess()
  const canEdit = permissionImplies(permissions, 'access_lists.edit')
  const canEditJapaneseName = permissionImplies(permissions, 'members.japanese_name.edit')
  const [lists, setLists] = useState<AccessListRow[]>([])
  const [selectedList, setSelectedList] = useState<AccessListRow | null>(null)
  const [members, setMembers] = useState<AccessMemberRow[]>([])
  const [externalPeople, setExternalPeople] = useState<ExternalPersonRow[]>([])
  const [memberOptions, setMemberOptions] = useState<MemberOptionRow[]>([])
  const [statusFilter, setStatusFilter] = useState('active')
  const [newName, setNewName] = useState('')
  const [editName, setEditName] = useState('')
  const [selectedMemberId, setSelectedMemberId] = useState('')
  const [externalName, setExternalName] = useState('')
  const [externalJapaneseName, setExternalJapaneseName] = useState('')
  const [externalWorkSchool, setExternalWorkSchool] = useState('')
  const [editingJapaneseMember, setEditingJapaneseMember] = useState<AccessMemberRow | null>(null)
  const [japaneseDraft, setJapaneseDraft] = useState('')
  const [copyState, setCopyState] = useState<CopyState>(null)
  const [draggingMemberId, setDraggingMemberId] = useState<string | null>(null)
  const [draggingExternalId, setDraggingExternalId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  async function loadLists() {
    setErrorMessage(null)
    let query = supabase.from('access_lists').select('id, name, day_type, status').order('created_at', { ascending: false })
    if (statusFilter !== 'all') query = query.eq('status', statusFilter)
    const { data, error } = await query
    if (error) { setErrorMessage(error.message); return }
    setLists((data ?? []) as AccessListRow[])
  }

  async function loadMemberOptions() {
    const { data, error } = await supabase.from('members').select('id, first_names, paternal_last_name, maternal_last_name, japanese_name, work_school_name, gender').eq('status', 'active').order('paternal_last_name', { ascending: true })
    if (error) { setErrorMessage(error.message); return }
    setMemberOptions((data ?? []) as MemberOptionRow[])
  }

  async function loadListDetail(accessListId: string) {
    setErrorMessage(null)
    const { data: memberData, error: memberError } = await supabase
      .from('access_list_members')
      .select('id, member_id, japanese_name_snapshot, work_school_name_snapshot, sort_order, members(id, first_names, paternal_last_name, maternal_last_name, japanese_name, work_school_name, gender)')
      .eq('access_list_id', accessListId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    if (memberError) { setErrorMessage(memberError.message); return }

    const { data: externalData, error: externalError } = await supabase.from('access_list_external_people').select('id, full_name, japanese_name, work_school_name, status, sort_order').eq('access_list_id', accessListId).order('sort_order', { ascending: true }).order('full_name', { ascending: true })
    if (externalError) { setErrorMessage(externalError.message); return }

    setMembers((memberData ?? []) as unknown as AccessMemberRow[])
    setExternalPeople((externalData ?? []) as ExternalPersonRow[])
  }

  useEffect(() => { const timer = window.setTimeout(() => { void loadLists(); void loadMemberOptions() }, 0); return () => window.clearTimeout(timer) }, [statusFilter])

  const availableMemberOptions = useMemo(() => {
    const assignedIds = new Set(members.map((member) => member.member_id))
    return memberOptions.filter((member) => !assignedIds.has(member.id))
  }, [memberOptions, members])

  async function createList() {
    if (!canEdit) { setErrorMessage('Tu rol permite consultar listas, pero no crearlas.'); return }
    if (!newName.trim()) { setErrorMessage('El nombre de la lista es obligatorio.'); return }
    const { error } = await supabase.from('access_lists').insert({ name: newName.trim(), day_type: 'custom', status: 'active' })
    if (error) { setErrorMessage(error.message); return }
    setNewName('')
    setSuccessMessage('Lista creada correctamente.')
    window.scrollTo({ top: 0, behavior: 'smooth' })
    await loadLists()
  }

  async function updateSelectedListName() {
    if (!canEdit || !selectedList) return
    if (!editName.trim()) { setErrorMessage('El nombre no puede estar vacío.'); return }
    const { error } = await supabase.from('access_lists').update({ name: editName.trim(), day_type: 'custom' }).eq('id', selectedList.id)
    if (error) { setErrorMessage(error.message); return }
    const updated = { ...selectedList, name: editName.trim(), day_type: 'custom' }
    setSelectedList(updated)
    setSuccessMessage('Nombre de lista actualizado.')
    window.scrollTo({ top: 0, behavior: 'smooth' })
    await loadLists()
  }

  async function getFullListDetail(accessListId: string) {
    const { data: memberData, error: memberError } = await supabase
      .from('access_list_members')
      .select('id, member_id, japanese_name_snapshot, work_school_name_snapshot, sort_order, members(id, first_names, paternal_last_name, maternal_last_name, japanese_name, work_school_name, gender)')
      .eq('access_list_id', accessListId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    if (memberError) throw memberError

    const { data: externalData, error: externalError } = await supabase
      .from('access_list_external_people')
      .select('id, full_name, japanese_name, work_school_name, status, sort_order')
      .eq('access_list_id', accessListId)
      .order('sort_order', { ascending: true })
      .order('full_name', { ascending: true })
    if (externalError) throw externalError

    return { members: (memberData ?? []) as unknown as AccessMemberRow[], externalPeople: (externalData ?? []) as ExternalPersonRow[] }
  }

  async function copyList(source: AccessListRow, newListName: string) {
    if (!canEdit) { setErrorMessage('Tu rol permite consultar listas, pero no copiarlas.'); return }
    if (!newListName.trim()) { setErrorMessage('Escribe el nombre de la nueva lista.'); return }

    const detail = source.id === selectedList?.id ? { members, externalPeople } : await getFullListDetail(source.id)
    const { data: newList, error } = await supabase.from('access_lists').insert({ name: newListName.trim(), day_type: 'custom', status: 'active' }).select('id, name, day_type, status').single()
    if (error) { setErrorMessage(error.message); return }

    if (detail.members.length > 0) {
      const { error: memberError } = await supabase.from('access_list_members').insert(detail.members.map((row) => ({ access_list_id: newList.id, member_id: row.member_id, japanese_name_snapshot: row.japanese_name_snapshot, work_school_name_snapshot: row.work_school_name_snapshot, sort_order: row.sort_order })))
      if (memberError) { setErrorMessage(memberError.message); return }
    }
    if (detail.externalPeople.length > 0) {
      const { error: externalError } = await supabase.from('access_list_external_people').insert(detail.externalPeople.map((row) => ({ access_list_id: newList.id, full_name: row.full_name, japanese_name: row.japanese_name, work_school_name: row.work_school_name, status: row.status, sort_order: row.sort_order })))
      if (externalError) { setErrorMessage(externalError.message); return }
    }

    setCopyState(null)
    setSelectedList(newList as AccessListRow)
    setEditName(newList.name)
    setSuccessMessage(`Lista copiada como: ${newList.name}`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
    await loadLists()
    await loadListDetail(newList.id)
  }

  async function addSelectedMember() {
    if (!canEdit || !selectedList) return
    const member = memberOptions.find((option) => option.id === selectedMemberId)
    if (!member) { setErrorMessage('Selecciona un miembro para agregar.'); return }
    const nextOrder = members.length > 0 ? Math.max(...members.map((row) => Number(row.sort_order ?? 0))) + 1 : 1
    const { error } = await supabase.from('access_list_members').insert({ access_list_id: selectedList.id, member_id: member.id, japanese_name_snapshot: member.japanese_name, work_school_name_snapshot: member.work_school_name, sort_order: nextOrder })
    if (error) { setErrorMessage(error.message); return }
    setSelectedMemberId('')
    await loadListDetail(selectedList.id)
  }

  async function removeMember(rowId: string) {
    if (!canEdit || !selectedList) return
    const { error } = await supabase.from('access_list_members').delete().eq('id', rowId)
    if (error) { setErrorMessage(error.message); return }
    await loadListDetail(selectedList.id)
  }

  async function addExternalPerson() {
    if (!canEdit || !selectedList) return
    if (!externalName.trim()) { setErrorMessage('El nombre del externo es obligatorio.'); return }
    const nextOrder = externalPeople.length > 0 ? Math.max(...externalPeople.map((row) => Number(row.sort_order ?? 0))) + 1 : 1
    const { error } = await supabase.from('access_list_external_people').insert({ access_list_id: selectedList.id, full_name: externalName.trim(), japanese_name: externalJapaneseName.trim() || null, work_school_name: externalWorkSchool.trim() || null, status: 'active', sort_order: nextOrder })
    if (error) { setErrorMessage(error.message); return }
    setExternalName(''); setExternalJapaneseName(''); setExternalWorkSchool('')
    await loadListDetail(selectedList.id)
  }

  async function removeExternalPerson(rowId: string) {
    if (!canEdit || !selectedList) return
    const { error } = await supabase.from('access_list_external_people').delete().eq('id', rowId)
    if (error) { setErrorMessage(error.message); return }
    await loadListDetail(selectedList.id)
  }


  async function saveMemberOrder(nextMembers: AccessMemberRow[]) {
    if (!canEdit || !selectedList) return
    setMembers(nextMembers)
    const updates = nextMembers.map((row, index) => supabase.from('access_list_members').update({ sort_order: index + 1 }).eq('id', row.id))
    const results = await Promise.all(updates)
    const firstError = results.find((result) => result.error)?.error
    if (firstError) { setErrorMessage(firstError.message); return }
    await loadListDetail(selectedList.id)
  }

  async function saveExternalOrder(nextExternalPeople: ExternalPersonRow[]) {
    if (!canEdit || !selectedList) return
    setExternalPeople(nextExternalPeople)
    const updates = nextExternalPeople.map((row, index) => supabase.from('access_list_external_people').update({ sort_order: index + 1 }).eq('id', row.id))
    const results = await Promise.all(updates)
    const firstError = results.find((result) => result.error)?.error
    if (firstError) { setErrorMessage(firstError.message); return }
    await loadListDetail(selectedList.id)
  }

  function moveRow<T extends { id: string }>(rows: T[], rowId: string, direction: 'up' | 'down') {
    const index = rows.findIndex((row) => row.id === rowId)
    const nextIndex = direction === 'up' ? index - 1 : index + 1
    if (index < 0 || nextIndex < 0 || nextIndex >= rows.length) return rows
    const next = [...rows]
    const [item] = next.splice(index, 1)
    next.splice(nextIndex, 0, item)
    return next
  }

  function dropMemberOn(targetId: string) {
    if (!draggingMemberId || draggingMemberId === targetId) return
    const fromIndex = members.findIndex((row) => row.id === draggingMemberId)
    const toIndex = members.findIndex((row) => row.id === targetId)
    if (fromIndex < 0 || toIndex < 0) return
    const next = [...members]
    const [item] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, item)
    setDraggingMemberId(null)
    saveMemberOrder(next)
  }

  function dropExternalOn(targetId: string) {
    if (!draggingExternalId || draggingExternalId === targetId) return
    const fromIndex = externalPeople.findIndex((row) => row.id === draggingExternalId)
    const toIndex = externalPeople.findIndex((row) => row.id === targetId)
    if (fromIndex < 0 || toIndex < 0) return
    const next = [...externalPeople]
    const [item] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, item)
    setDraggingExternalId(null)
    saveExternalOrder(next)
  }

  async function toggleListStatus(list: AccessListRow) {
    if (!canEdit) { setErrorMessage('Tu rol permite consultar listas, pero no cambiar estatus.'); return }
    const nextStatus = list.status === 'active' ? 'inactive' : 'active'
    const { error } = await supabase.from('access_lists').update({ status: nextStatus }).eq('id', list.id)
    if (error) { setErrorMessage(error.message); return }
    if (selectedList?.id === list.id) setSelectedList({ ...list, status: nextStatus })
    await loadLists()
  }

  function openJapaneseEdit(row: AccessMemberRow) {
    setEditingJapaneseMember(row)
    setJapaneseDraft(row.japanese_name_snapshot ?? row.members?.japanese_name ?? '')
  }

  async function saveJapaneseName() {
    if (!selectedList || !editingJapaneseMember || !canEditJapaneseName) return
    const { error } = await supabase.from('access_list_members').update({ japanese_name_snapshot: japaneseDraft.trim() || null }).eq('id', editingJapaneseMember.id)
    if (error) { setErrorMessage(error.message); return }
    const { error: memberError } = await supabase.from('members').update({ japanese_name: japaneseDraft.trim() || null }).eq('id', editingJapaneseMember.member_id)
    if (memberError) { setErrorMessage(memberError.message); return }
    setEditingJapaneseMember(null)
    await loadMemberOptions()
    await loadListDetail(selectedList.id)
  }

  async function exportListByRow(list: AccessListRow) {
    try {
      const detail = await getFullListDetail(list.id)
      exportJapaneseAccessList(list, detail.members, detail.externalPeople)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'No se pudo exportar la lista.')
    }
  }

  function selectList(list: AccessListRow) {
    setSelectedList(list)
    setEditName(list.name)
    loadListDetail(list.id)
  }

  return (
    <ModuleShell title="Listas de acceso" subtitle="Administra listas, miembros, externos y exportación japonesa." icon="/icons/icon-access-lists.png" moduleType="Gestión" version="Listas acceso v13">
      {errorMessage && <section className="rounded-3xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-100">{errorMessage}</section>}
      <SaveConfirmation message={successMessage} onClose={() => setSuccessMessage(null)} />

      {canEdit && <section className="rounded-[2rem] border border-white/10 bg-white/5 p-5 shadow-2xl"><p className="text-xs uppercase tracking-[0.3em] text-cyan-300">Nueva lista</p><div className="mt-4 space-y-4"><Field label="Nombre" value={newName} onChange={setNewName} /><PrimaryButton onClick={createList}>Crear lista</PrimaryButton></div></section>}
      {!canEdit && <section className="rounded-3xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100">Modo consulta: puedes revisar y exportar listas, pero no editarlas.</section>}

      <SelectField label="Estatus" value={statusFilter} onChange={setStatusFilter} options={[{ value: 'active', label: 'Activas' }, { value: 'inactive', label: 'Inactivas' }, { value: 'all', label: 'Todas' }]} />
      {selectedList && <div className="grid grid-cols-2 gap-3"><SecondaryButton onClick={() => exportJapaneseAccessList(selectedList, members, externalPeople)}>Excel</SecondaryButton>{canEdit && <SecondaryButton onClick={() => setCopyState({ source: selectedList, newName: `${selectedList.name} - copia` })}>Copiar lista</SecondaryButton>}</div>}

      <section className="overflow-x-auto rounded-3xl border border-white/10 bg-white/5 shadow-2xl">
        <div className="min-w-[860px]">
          <div className="grid grid-cols-[380px_330px_130px] border-b border-white/10 bg-slate-900/80 px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-cyan-300"><div>Acciones</div><div>Lista</div><div>Estatus</div></div>
          <div className="divide-y divide-white/10">{lists.map((list) => <div key={list.id} className="grid grid-cols-[380px_330px_130px] items-center px-4 py-3 text-sm"><div className="flex flex-wrap gap-2"><button type="button" className="rounded-xl border border-cyan-400/30 px-3 py-2 text-xs text-cyan-100" onClick={() => selectList(list)}>Ver</button><button type="button" className="rounded-xl border border-emerald-400/30 px-3 py-2 text-xs text-emerald-100" onClick={() => exportListByRow(list)}>Excel</button>{canEdit && <button type="button" className="rounded-xl border border-violet-400/30 px-3 py-2 text-xs text-violet-100" onClick={() => setCopyState({ source: list, newName: `${list.name} - copia` })}>Copiar</button>}{canEdit && <button type="button" className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-200" onClick={() => toggleListStatus(list)}>{list.status === 'active' ? 'Inactivar' : 'Activar'}</button>}</div><div className="truncate">{list.name}</div><div><StatusBadge status={list.status} /></div></div>)}</div>
        </div>
      </section>

      {selectedList && (
        <section className="rounded-[2rem] border border-white/10 bg-white/5 p-5 shadow-2xl">
          <p className="text-sm font-bold">Detalle: {selectedList.name}</p>
          <p className="mt-2 text-xs text-slate-400">Miembros: {members.length} · Externos: {externalPeople.length}</p>
          {canEdit && <div className="mt-4 grid grid-cols-[1fr_auto] gap-3"><Field label="Nombre de lista" value={editName} onChange={setEditName} /><div className="pt-7"><PrimaryButton onClick={updateSelectedListName}>Guardar</PrimaryButton></div></div>}

          {canEdit && <div className="mt-5 space-y-4 rounded-3xl border border-white/10 bg-slate-950/50 p-4"><SelectField label="Agregar miembro" value={selectedMemberId} onChange={setSelectedMemberId} options={[{ value: '', label: 'Selecciona...' }, ...availableMemberOptions.map((member) => ({ value: member.id, label: fullName(member) }))]} /><PrimaryButton onClick={addSelectedMember}>Agregar miembro</PrimaryButton><div className="grid grid-cols-1 gap-3"><Field label="Externo - nombre completo" value={externalName} onChange={setExternalName} /><Field label="Nombre japonés" value={externalJapaneseName} onChange={setExternalJapaneseName} /><Field label="Trabajo/Escuela" value={externalWorkSchool} onChange={setExternalWorkSchool} /><PrimaryButton onClick={addExternalPerson}>Agregar externo</PrimaryButton></div></div>}

          <section className="mt-5 overflow-x-auto rounded-3xl border border-white/10"><p className="bg-slate-900/80 px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">Miembros</p><p className="px-4 pt-3 text-xs text-slate-400">Puedes subir/bajar o arrastrar filas para ordenar cómo saldrán en la lista exportada.</p><div className="min-w-[820px]"><div className="grid grid-cols-[105px_220px_180px_180px_120px] bg-slate-900/60 px-4 py-3 text-xs font-bold text-slate-300"><div>Orden</div><div>Nombre</div><div>Japonés</div><div>Trabajo/Escuela</div><div>Acciones</div></div><div className="divide-y divide-white/10">{members.map((row) => <div key={row.id} draggable={canEdit} onDragStart={() => setDraggingMemberId(row.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => dropMemberOn(row.id)} className={`grid grid-cols-[105px_220px_180px_180px_120px] items-center px-4 py-3 text-sm ${draggingMemberId === row.id ? 'bg-cyan-400/10' : ''}`}><div className="flex items-center gap-1 text-xs">{canEdit && <><button type="button" className="rounded-lg border border-white/10 px-2 py-1" onClick={() => saveMemberOrder(moveRow(members, row.id, 'up'))}>↑</button><button type="button" className="rounded-lg border border-white/10 px-2 py-1" onClick={() => saveMemberOrder(moveRow(members, row.id, 'down'))}>↓</button><span className="cursor-grab text-slate-400">⋮⋮</span></>}</div><div className="truncate">{fullName(row.members ?? {})}</div><div className="truncate text-slate-300">{row.japanese_name_snapshot ?? row.members?.japanese_name ?? '-'}</div><div className="truncate text-slate-300">{row.work_school_name_snapshot ?? row.members?.work_school_name ?? '-'}</div><div className="flex gap-2">{canEditJapaneseName && <button type="button" className="text-xs text-cyan-100" onClick={() => openJapaneseEdit(row)}>Japonés</button>}{canEdit && <button type="button" className="text-xs text-red-200" onClick={() => removeMember(row.id)}>Quitar</button>}</div></div>)}</div></div></section>

          <section className="mt-5 overflow-x-auto rounded-3xl border border-white/10"><p className="bg-slate-900/80 px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">Externos</p><p className="px-4 pt-3 text-xs text-slate-400">El orden también se respeta en el Excel.</p><div className="min-w-[740px]"><div className="grid grid-cols-[105px_220px_170px_170px_80px] bg-slate-900/60 px-4 py-3 text-xs font-bold text-slate-300"><div>Orden</div><div>Nombre</div><div>Japonés</div><div>Trabajo/Escuela</div><div></div></div><div className="divide-y divide-white/10">{externalPeople.map((row) => <div key={row.id} draggable={canEdit} onDragStart={() => setDraggingExternalId(row.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => dropExternalOn(row.id)} className={`grid grid-cols-[105px_220px_170px_170px_80px] items-center px-4 py-3 text-sm ${draggingExternalId === row.id ? 'bg-cyan-400/10' : ''}`}><div className="flex items-center gap-1 text-xs">{canEdit && <><button type="button" className="rounded-lg border border-white/10 px-2 py-1" onClick={() => saveExternalOrder(moveRow(externalPeople, row.id, 'up'))}>↑</button><button type="button" className="rounded-lg border border-white/10 px-2 py-1" onClick={() => saveExternalOrder(moveRow(externalPeople, row.id, 'down'))}>↓</button><span className="cursor-grab text-slate-400">⋮⋮</span></>}</div><div className="truncate">{row.full_name}</div><div className="truncate text-slate-300">{row.japanese_name ?? '-'}</div><div className="truncate text-slate-300">{row.work_school_name ?? '-'}</div><div>{canEdit && <button type="button" className="text-xs text-red-200" onClick={() => removeExternalPerson(row.id)}>Quitar</button>}</div></div>)}</div></div></section>
        </section>
      )}

      {copyState && <ModalPanel title="Copiar lista" onClose={() => setCopyState(null)}><div className="space-y-4"><p className="text-sm leading-6 text-slate-300">Se copiarán todos los miembros, externos, nombres japoneses y escuela/trabajo de la lista: <strong>{copyState.source.name}</strong>.</p><Field label="Nombre de la nueva lista" value={copyState.newName} onChange={(value) => setCopyState({ ...copyState, newName: value })} /><PrimaryButton onClick={() => copyList(copyState.source, copyState.newName)}>Crear copia completa</PrimaryButton></div></ModalPanel>}
      {editingJapaneseMember && <ModalPanel title="Editar nombre japonés" onClose={() => setEditingJapaneseMember(null)}><div className="space-y-4"><p className="text-sm text-slate-300">{fullName(editingJapaneseMember.members ?? {})}</p><Field label="Nombre japonés" value={japaneseDraft} onChange={setJapaneseDraft} /><PrimaryButton onClick={saveJapaneseName}>Guardar nombre japonés</PrimaryButton></div></ModalPanel>}
    </ModuleShell>
  )
}
