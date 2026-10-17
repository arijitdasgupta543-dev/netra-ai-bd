import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useLang } from '@/lib/i18n';
import { validModelUrl } from '@/lib/capture';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function useModelUrl() {
  return useQuery({queryKey:['research-model-url'],queryFn:async()=>{
    const {data,error}=await supabase.from('settings').select('model_url').eq('key','research_model').maybeSingle();
    if(error) throw error; return data?.model_url ?? '/model/model.json';
  }});
}
export function ModelSettings() {
  const {role}=useAuth(),{L}=useLang(),q=useModelUrl(),qc=useQueryClient();
  const [value,setValue]=useState('/model/model.json'),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  useEffect(()=>{if(q.data)setValue(q.data);},[q.data]);
  if(role!=='admin')return null;
  const save=async()=>{
    setMessage('');if(!validModelUrl(value.trim())){setMessage(L('Use an HTTPS model URL or /model/model.json.','HTTPS মডেল URL বা /model/model.json ব্যবহার করুন।'));return;}
    setBusy(true);
    const {error}=await supabase.from('settings').upsert({key:'research_model',model_url:value.trim(),updated_at:new Date().toISOString()});
    setBusy(false);setMessage(error ? L('Could not save model URL.','মডেল URL সংরক্ষণ হয়নি।') : L('Model URL saved.','মডেল URL সংরক্ষিত।'));
    if(!error) await qc.invalidateQueries({queryKey:['research-model-url']});
  };
  return <section className="space-y-3 border-t pt-5"><Label htmlFor="model-url">{L('Research model URL','গবেষণা মডেলের URL')}</Label><Input id="model-url" type="url" value={value} onChange={e=>setValue(e.target.value)} className="h-12"/><Button type="button" className="h-12" disabled={busy||q.isPending||!!q.error} onClick={save}>{L('Save model URL','মডেল URL সংরক্ষণ করুন')}</Button>{q.error && <p className="text-sm text-destructive">{L('Could not load model setting.','মডেল সেটিং লোড হয়নি।')}</p>}{message && <p role="status" className="text-sm">{message}</p>}</section>;
}