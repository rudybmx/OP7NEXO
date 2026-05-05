import os

def replace_in_file(filepath, replacements):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        changed = False
        new_content = content
        for old_text, new_text in replacements:
            if old_text in new_content:
                new_content = new_content.replace(old_text, new_text)
                changed = True
        
        if changed:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"Updated: {filepath}")
    except Exception as e:
        print(f"Error processing {filepath}: {e}")

def main():
    root_dir = r"d:\QÓZT\PROJETOS IA\APP\op7_odontocompany_dashboard\src"
    replacements = [
        ("__wersunWhatsappRealtimeState__", "__odontocompanyWhatsappRealtimeState__"),
        ("wersun-meta-filtros", "odontocompany-meta-filtros"),
        ("wersun-criativos-cols", "odontocompany-criativos-cols"),
        ("wersun-grid-cols", "odontocompany-grid-cols"),
        ("wersun_admin", "odontocompany_admin"),
        ("redis_wersun", "redis_odontocompany"),
        ("agentewersun.qozt.com.br", "agente-odontocompany.qozt.com.br"),
        ("@wersun.com", "@odontocompany-op7.com"),
        ("ws-sidebar-collapsed", "oc-sidebar-collapsed")
    ]
    
    for subdir, dirs, files in os.walk(root_dir):
        for file in files:
            if file.endswith(('.tsx', '.ts', '.css', '.md', '.html')):
                filepath = os.path.join(subdir, file)
                replace_in_file(filepath, replacements)

if __name__ == "__main__":
    main()
