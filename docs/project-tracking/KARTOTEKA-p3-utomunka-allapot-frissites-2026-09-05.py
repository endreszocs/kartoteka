# -*- coding: utf-8 -*-
"""
Élő állapot-frissítő a P3-utómunka körhöz: a workflow naplójából újraírja a
KARTOTEKA-p3-utomunka-allapot-2026-09-05.md AUTO-szakaszát. Kézzel írt részhez nem nyúl.
Futtatás: PYTHONIOENCODING=utf-8 python <ez a fájl>
"""
import json, io, os, re, datetime

WF_DIR = r"C:\Users\endre\.claude\projects\C--Users-endre-Documents-APPS-Egyh-zi-APP-KARTOTEKA--claude-worktrees-admin-egyeztetes-leltar\eeea675a-362a-4da9-a5ac-e2913b72d97a\subagents\workflows"
DOC = r"C:\Users\endre\Documents\APPS\Egyházi APP\KARTOTEKA\.claude\worktrees\p3-utomunka\docs\project-tracking\KARTOTEKA-p3-utomunka-allapot-2026-09-05.md"
WORKFLOWS = [
    ("wf_b6205211-63d", "P3-utómunka (5 impl + ellenőrzés + 5 bíráló + javítók)"),
]

def feladat_cime(agent_path):
    """A transcript első üzenetéből a FELADAT (…) fejléc — a terület/szerep neve."""
    try:
        with io.open(agent_path, encoding='utf-8') as f:
            head = f.read(30000)
        # A fejléc alakja: FELADAT (kulcs — leírás…) vagy FELADAT (BÍRÁLÓ — kulcs terület) — a
        # leírásban zárójel is lehet, ezért a kulcsig/első „ — " utánig olvasunk, nem a záró zárójelig.
        m = re.search(r'FELADAT \(([^\n]{3,60}?)(?: terület\)|\):|;| —  ?\n|\n)', head)
        if m:
            return m.group(1).strip()
        m = re.search(r'FELADAT \(([^\n]{3,80})', head)
        if m:
            return m.group(1).strip()
    except Exception as e:
        return '? (%s)' % e
    return '?'

def workflow_allapot(run_id):
    d = os.path.join(WF_DIR, run_id)
    journal = os.path.join(d, 'journal.jsonl')
    started, results, failed = {}, {}, {}
    if not os.path.exists(journal):
        return None
    for line in io.open(journal, encoding='utf-8'):
        try:
            o = json.loads(line)
        except Exception:
            continue
        t = o.get('type')
        aid = o.get('agentId')
        if t == 'started':
            started[aid] = o
        elif t == 'result':
            results[aid] = o.get('result')
        elif t == 'failed':
            failed[aid] = o.get('error') or o.get('reason') or 'ismeretlen hiba'
    sorok = []
    for aid in started:
        cim = feladat_cime(os.path.join(d, 'agent-%s.jsonl' % aid))
        st = 'KÉSZ' if aid in results else ('ELHALT' if aid in failed else 'FUT')
        sorok.append((cim, st, results.get(aid), failed.get(aid)))
    return sorok

def rovid(s, n=700):
    s = (s or '').replace('\r', '').strip()
    return s if len(s) <= n else s[:n] + '…'

out = []
out.append('<!-- AUTO-START — ezt a szakaszt a KARTOTEKA-p3-utomunka-allapot-frissites-2026-09-05.py írja; kézzel ne szerkeszd -->')
out.append('_Utolsó automatikus frissítés: %s_' % datetime.datetime.now().strftime('%Y-%m-%d %H:%M'))
out.append('')
for run_id, nev in WORKFLOWS:
    sorok = workflow_allapot(run_id)
    out.append('### %s — `%s`' % (nev, run_id))
    if sorok is None:
        out.append('_(nincs napló)_')
        out.append('')
        continue
    kesz = sum(1 for s in sorok if s[1] == 'KÉSZ')
    fut = sum(1 for s in sorok if s[1] == 'FUT')
    elhalt = sum(1 for s in sorok if s[1] == 'ELHALT')
    out.append('Ügynökök: **%d kész · %d fut · %d elhalt** (összesen %d).' % (kesz, fut, elhalt, len(sorok)))
    out.append('')
    for cim, st, res, hiba in sorok:
        out.append('#### %s — **%s**' % (cim, st))
        if st == 'ELHALT':
            out.append('- hiba: %s' % rovid(str(hiba), 200))
        if isinstance(res, dict):
            if 'kesz' in res:
                out.append('- kész: %s' % ('igen' if res.get('kesz') else 'NEM'))
            if res.get('osszefoglalo'):
                out.append('- Összefoglaló: %s' % rovid(res['osszefoglalo'], 900))
            if res.get('modositottFajlok'):
                out.append('- Módosított: %s' % ', '.join('`%s`' % f for f in res['modositottFajlok'][:40]))
            if res.get('ujSelftestek'):
                out.append('- Új selftestek (REGISZTRÁLANDÓ a package.json-ba): %s' % ', '.join('`%s`' % t for t in res['ujSelftestek']))
            if res.get('sqlIgeny'):
                out.append('- SQL-igény: %s' % rovid(res['sqlIgeny'], 400))
            if res.get('nyitottKerdesek'):
                out.append('- Nyitott kérdések: ' + ' · '.join(rovid(k, 220) for k in res['nyitottKerdesek'][:8]))
            if 'typecheckOk' in res:
                out.append('- typecheck: %s · lint: %s · selftest: %s' % (res.get('typecheckOk'), res.get('lintOk'), res.get('selftestOk')))
                if res.get('javitasok'):
                    out.append('- Javítások: ' + ' · '.join(rovid(k, 200) for k in res['javitasok'][:12]))
                if res.get('maradekHibak'):
                    out.append('- MARADÉK HIBÁK: ' + ' · '.join(rovid(k, 200) for k in res['maradekHibak'][:12]))
            if 'findings' in res:
                fs = res['findings']
                out.append('- Bírálati találatok: %d (%s)' % (len(fs), ', '.join('%s %s' % (f.get('severity'), rovid(f.get('title'), 90)) for f in fs[:12])))
            if 'javitott' in res:
                out.append('- Javítva: %d · elutasítva: %d' % (len(res.get('javitott') or []), len(res.get('elutasitott') or [])))
        elif isinstance(res, str):
            out.append('- Eredmény: %s' % rovid(res, 600))
        out.append('')
out.append('<!-- AUTO-END -->')

auto = '\n'.join(out)
doc = io.open(DOC, encoding='utf-8', newline='').read()
a, b = doc.find('<!-- AUTO-START'), doc.find('<!-- AUTO-END -->')
assert a >= 0 and b > a, 'AUTO markerek hiányoznak a dokumentumból'
doc = doc[:a] + auto + doc[b + len('<!-- AUTO-END -->'):]
io.open(DOC, 'w', encoding='utf-8', newline='').write(doc)
print('frissítve:', DOC)
