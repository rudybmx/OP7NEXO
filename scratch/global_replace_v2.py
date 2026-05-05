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
        ("Wer'Sun", "Odontocompany by Op7"),
        ("Wer&apos;Sun", "Odontocompany by Op7"),
        ("Wer sun", "Odontocompany by Op7"),
        ("Wersun", "Odontocompany by Op7")
    ]
    
    for subdir, dirs, files in os.walk(root_dir):
        for file in files:
            if file.endswith(('.tsx', '.ts', '.css', '.md', '.html')):
                filepath = os.path.join(subdir, file)
                replace_in_file(filepath, replacements)

if __name__ == "__main__":
    main()
