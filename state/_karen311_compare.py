import subprocess

r = subprocess.run(['awk', '/^push_with_retry\\(\\) \\{/,/^\\}/', 'scripts/test_push_retry.sh'], capture_output=True, text=True)
open('/tmp/test_copy.txt', 'w').write(r.stdout)

r2 = subprocess.run(['sed', '-n', '131,217p', 'scripts/dispatcher.sh'], capture_output=True, text=True)
open('/tmp/real.txt', 'w').write(r2.stdout)

d = subprocess.run(['diff', '/tmp/test_copy.txt', '/tmp/real.txt'], capture_output=True, text=True)
print(d.stdout)
print('DIFF_RC', d.returncode)
