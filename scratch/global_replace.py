import os

def replace_in_file(filepath, old_text, new_text):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        if old_text in content:
            new_content = content.replace(old_text, new_text)
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"Updated: {filepath}")
    except Exception as e:
        print(f"Error processing {filepath}: {e}")

def main():
    root_dir = r"d:\QÓZT\PROJETOS IA\APP\op7_odontocompany_dashboard\src"
    old_text = "Wer'Sun"
    new_text = "Odontocompany by Op7"
    
    for subdir, dirs, files in os.walk(root_dir):
        for file in files:
            if file.endswith(('.tsx', '.ts', '.css', '.md', '.html')):
                filepath = os.path.join(subdir, file)
                replace_in_file(filepath, old_text, new_text)

if __name__ == "__main__":
    main()
