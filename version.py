# Sube la version de los ficheros propios en index.html para que el navegador
# no sirva JS viejo tras un despliegue. Ejecutar antes de cada commit:
#   python version.py
import io, re, subprocess
n = subprocess.check_output(['git','rev-list','--count','HEAD'], text=True).strip()
n = str(int(n) + 1)                      # el commit que se esta a punto de hacer
p = 'index.html'
s = io.open(p, encoding='utf-8').read()
s = re.sub(r'(href="css/style\.css)\?v=\d*(")', r'\1?v=' + n + r'\2', s)
s = re.sub(r'(src="js/[a-z]+\.js)\?v=\d*(")', r'\1?v=' + n + r'\2', s)
io.open(p, 'w', encoding='utf-8').write(s)
print('version ->', n)
