import os
import yaml

def get_player_map(person_dir):
    PLAYER_MAP = {}
    for filename in os.listdir(person_dir):
        if filename.endswith('.md'):
            path = os.path.join(person_dir, filename)
            with open(path, encoding='utf-8') as f:
                lines = f.readlines()
            if lines[0].strip() == '---':
                end = 1
                while end < len(lines) and lines[end].strip() != '---':
                    end += 1
                front_matter = ''.join(lines[1:end])
                data = yaml.safe_load(front_matter)
                tag = data.get('bsid', '').replace('#', '')
                name = data.get('name', '')
                if tag and name:
                    PLAYER_MAP[tag] = name.lower().replace(' ', '_')
    return PLAYER_MAP

def get_player_names(person_dir):
    names = []
    for filename in os.listdir(person_dir):
        if filename.endswith('.md'):
            path = os.path.join(person_dir, filename)
            with open(path, encoding='utf-8') as f:
                lines = f.readlines()
            if lines[0].strip() == '---':
                end = 1
                while end < len(lines) and lines[end].strip() != '---':
                    end += 1
                front_matter = ''.join(lines[1:end])
                data = yaml.safe_load(front_matter)
                name = data.get('name', '')
                if name:
                    names.append(name.lower().replace(' ', '_'))
    return names

def get_name_to_tag_map(person_dir):
    name_to_tag = {}
    for filename in os.listdir(person_dir):
        if filename.endswith('.md'):
            path = os.path.join(person_dir, filename)
            with open(path, encoding='utf-8') as f:
                lines = f.readlines()
            if lines[0].strip() == '---':
                end = 1
                while end < len(lines) and lines[end].strip() != '---':
                    end += 1
                front_matter = ''.join(lines[1:end])
                data = yaml.safe_load(front_matter)
                tag = data.get('bsid', '').replace('#', '')
                name = data.get('name', '')
                if tag and name:
                    name_to_tag[name.lower().replace(' ', '_')] = tag
    return name_to_tag