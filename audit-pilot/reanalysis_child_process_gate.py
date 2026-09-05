from __future__ import annotations
import json, tempfile
from pathlib import Path

from consensus import build_consensus
from reanalysis import run_clue_free_reanalysis
from sealed_room import run_sealed_process


def main():
    with tempfile.TemporaryDirectory() as td:
        p=Path(td)
        contract=p/'contract.txt'; invoice=p/'invoice.csv'; evidence=p/'payroll.csv'
        contract.write_text('Labor shall be billed using an overall multiplier factor of 2.417 applied to actual hourly payroll labor rates.',encoding='utf-8')
        invoice.write_text('invoice_id,description,hours,rate\nLIVE-1,Field Engineer,7.5,84.75\n',encoding='utf-8')
        evidence.write_text('description,hourly_rate\nField Engineer,31.28\n',encoding='utf-8')
        kw=dict(audit_id='REAL-CHILD-REANALYSIS',contract=str(contract),invoice=str(invoice),field=None,evidence=[str(evidence)])

        # Real initial child-process outputs. No mocks and no in-process analyzers.
        clean={a:run_sealed_process(a,**kw) for a in ('A','B','C')}
        clean_consensus=build_consensus(clean)
        amounts={a:round(float((clean[a].get('findings') or [{}])[0].get('amount') or 0),2) for a in ('A','B','C')}
        assert amounts=={'A':68.60,'B':68.60,'C':68.60},amounts
        assert clean_consensus['verified_total']==68.60,clean_consensus

        # Force disagreement ONLY in the parent-side committed initial snapshot.
        # This never changes source evidence and is never passed to a child. The retry
        # must independently rediscover the answer from original evidence in fresh rooms.
        forced=json.loads(json.dumps(clean))
        forced['C']['findings'][0]['amount']=0.0
        forced['C']['findings'][0]['_zero_dave_trace']['amount']=0.0
        forced_consensus=build_consensus(forced)
        assert any(f.get('state')=='UNRESOLVED' for f in forced_consensus['findings']),forced_consensus
        assert forced_consensus['verified_total']==0.0,forced_consensus

        out=run_clue_free_reanalysis(initial_results=forced,initial_consensus=forced_consensus,**kw)
        final=out['final_consensus']
        final_amounts={a:round(float((out['final_analyzer_results'][a].get('findings') or [{}])[0].get('amount') or 0),2) for a in ('A','B','C')}
        assert final_amounts=={'A':68.60,'B':68.60,'C':68.60},final_amounts
        assert out['passes_used']>=1,out
        assert out['resolved_after_initial_disagreement'] is True,out
        assert out['persistent_disagreement'] is False,out
        assert final['verified_total']==68.60,final
        assert any(f.get('state')=='RECONCILED' for f in final['findings']),final
        policy=out['policy']
        for k in ('peer_outputs_supplied_to_analyzers','peer_amounts_supplied_to_analyzers','peer_rules_supplied_to_analyzers','peer_source_locations_supplied_to_analyzers','divergence_stage_supplied_to_analyzers','target_answer_supplied_to_analyzers','majority_vote_authorizes_money'):
            assert policy[k] is False,(k,policy)
        print(json.dumps({'ok':True,'initial_real_amounts':amounts,'forced_initial_verified_total':forced_consensus['verified_total'],'retry_real_amounts':final_amounts,'passes_used':out['passes_used'],'final_verified_total':final['verified_total'],'final_states':[f.get('state') for f in final['findings']],'policy':policy},indent=2))

if __name__=='__main__': main()
