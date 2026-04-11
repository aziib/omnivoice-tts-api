import json
with open('c:\\OmniVoice\\docs\\lang_id_name_map.tsv', 'r', encoding='utf-8') as f:
    lines = f.read().strip().split('\n')[1:]
    langs = [line.split('\t')[1] for line in lines]

langs.sort()

with open('c:\\OmniVoice\\frontend\\src\\languages.ts', 'w', encoding='utf-8') as f:
    f.write('export const LANGUAGES = ' + json.dumps(langs) + ';\n')
