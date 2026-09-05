from __future__ import annotations

from unittest.mock import patch

import reanalysis


def finding(analyzer, amount, rule='2.0'):
    return {'analyzer': analyzer, 'findings': [{'status':'HIGH','amount':amount,'code':'RATE_MISMATCH','_zero_dave_trace':{'rule_kind':'labor_multiplier','rule_value':rule,'invoice_id':'INV-1','formula_id':'LABOR_RATE_DELTA','inputs':{'billed_rate':30.0,'payroll_rate':10.0,'multiplier':2.0,'hours':10.0}}}]}


def consensus(results):
    return reanalysis.build_consensus(results)


def test_no_clue_leakage_and_all_three_rerun():
    initial={'A':finding('A',100),'B':finding('B',100),'C':finding('C',90)}
    seen=[]
    def fake(name, **kw):
        seen.append((name, set(kw), dict(kw)))
        return finding(name,100)
    with patch.object(reanalysis,'run_sealed_process',side_effect=fake):
        out=reanalysis.run_clue_free_reanalysis(audit_id='X',contract='c',invoice='i',field=None,evidence=['e'],initial_results=initial,initial_consensus=consensus(initial))
    assert [x[0] for x in seen]==['A','B','C']
    allowed={'audit_id','contract','invoice','field','evidence'}
    assert all(keys==allowed for _,keys,_ in seen)
    forbidden=('peer','consensus','disagreement','target','expected','answer','finding','amount','rule','source','divergence')
    assert all(not any(tok in str(kwargs).lower() for tok in forbidden) for _,_,kwargs in seen)
    assert out['policy']['peer_outputs_supplied_to_analyzers'] is False


def test_forced_disagreement_reconciles_without_majority_vote():
    initial={'A':finding('A',100),'B':finding('B',100),'C':finding('C',90)}
    with patch.object(reanalysis,'run_sealed_process',side_effect=lambda name,**kw:finding(name,100)):
        out=reanalysis.run_clue_free_reanalysis(audit_id='X',contract='c',invoice='i',field=None,evidence=[],initial_results=initial,initial_consensus=consensus(initial))
    assert out['resolved_after_initial_disagreement'] is True
    assert out['persistent_disagreement'] is False
    assert out['passes_used']==1
    assert out['history'][0]['consensus']['findings'][0]['state']=='UNRESOLVED'
    assert out['final_consensus']['findings'][0]['state']=='RECONCILED'
    assert out['final_consensus']['verified_total']==100.0


def test_persistent_disagreement_exhausts_budget_and_stays_out_of_verified_total():
    initial={'A':finding('A',100),'B':finding('B',100),'C':finding('C',90)}
    def fake(name,**kw): return finding(name,90 if name=='C' else 100)
    with patch.object(reanalysis,'run_sealed_process',side_effect=fake):
        out=reanalysis.run_clue_free_reanalysis(audit_id='X',contract='c',invoice='i',field=None,evidence=[],initial_results=initial,initial_consensus=consensus(initial))
    assert out['max_passes']==2
    assert out['passes_used']==2
    assert out['persistent_disagreement'] is True
    assert out['final_consensus']['verified_total']==0.0
    assert all(f['state']=='UNRESOLVED' for f in out['final_consensus']['findings'])


def test_no_reanalysis_when_initial_consensus_is_clean():
    initial={x:finding(x,100) for x in ('A','B','C')}
    with patch.object(reanalysis,'run_sealed_process') as runner:
        out=reanalysis.run_clue_free_reanalysis(audit_id='X',contract='c',invoice='i',field=None,evidence=[],initial_results=initial,initial_consensus=consensus(initial))
    runner.assert_not_called()
    assert out['passes_used']==0
    assert out['final_consensus']['verified_total']==100.0
