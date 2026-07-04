import { supabase } from './supabaseClient'

export async function logAuditEvent(
  module: string,
  action: string,
  details?: Record<string, unknown>,
) {
  try {
    await supabase.rpc('aekia_log_event', {
      p_module: module,
      p_action: action,
      p_entity_table: null,
      p_entity_id: null,
      p_old_values: null,
      p_new_values: details ?? null,
    })
  } catch (error) {
    console.warn('No se pudo registrar auditoría', error)
  }
}
