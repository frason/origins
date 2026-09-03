import subprocess

current = subprocess.run(
    ["gh", "issue", "view", "246", "--repo", "frason/origins", "--json", "body", "--jq", ".body"],
    capture_output=True, text=True
).stdout

marker = "<!-- agent-planned -->"
if current.rstrip().endswith(marker):
    current = current.rstrip()[: -len(marker)].rstrip()

with open("state/tmp_246_append.md") as f:
    append = f.read()

new_body = current + "\n" + append.strip() + "\n\n" + marker + "\n"

with open("state/tmp_246_newbody.md", "w") as f:
    f.write(new_body)

print(len(new_body))
