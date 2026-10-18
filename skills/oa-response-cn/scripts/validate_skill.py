#!/usr/bin/env python3
"""Structure/references checker for an oa-response-cn directory; no dependencies except PyYAML optional.
Usage: python scripts/validate_skill.py [skill_root]
"""
from pathlib import Path
import re, sys
root=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path(__file__).resolve().parents[1]
errors=[]
sk=root/'SKILL.md'
if not sk.is_file(): errors.append('缺少SKILL.md')
else:
    txt=sk.read_text(encoding='utf-8')
    if not txt.startswith('---\n'): errors.append('SKILL.md缺少YAML frontmatter')
    else:
        fm=txt.split('---',2)[1]
        for key in ('name:', 'description:'):
            if key not in fm: errors.append(f'frontmatter缺少{key}')
        if 'oa-response-cn' not in fm: errors.append('名称不正确')
    for fn in re.findall(r'`((?:references|assets|tests|scripts)/[^`\n]+)`',txt):
        if '*' in fn or '$' in fn:continue
        if not (root/fn).is_file():errors.append(f'SKILL.md引用不存在：{fn}')
for required in ['references/mairui_decision_tree.md','references/creativity_framework.md','references/claim_amendment.md','references/oa_writing_style.md','tests/smoke_tests.md']:
    if not (root/required).is_file():errors.append(f'缺少必需文件：{required}')
print(('PASS' if not errors else 'FAIL')+f': {root}, 文件数 {sum(x.is_file() for x in root.rglob("*"))}')
for err in errors:print(' - '+err)
sys.exit(bool(errors))
