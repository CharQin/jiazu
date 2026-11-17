"""Draw the project's own sprout mark for legacy Android launcher icons."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent.parent
scale = 8
image = Image.new('RGB', (108 * scale, 108 * scale), '#ecf2e6')
draw = ImageDraw.Draw(image)
def line(points, color, width=3.8):
    draw.line([(int(x * scale), int(y * scale)) for x, y in points], fill=color, width=int(width * scale), joint='curve')
def leaf(start, control1, control2, end, control3, control4, color):
    def curve(a,b,c,d):
        return [((1-t)**3*a[0]+3*(1-t)**2*t*b[0]+3*(1-t)*t*t*c[0]+t**3*d[0], (1-t)**3*a[1]+3*(1-t)**2*t*b[1]+3*(1-t)*t*t*c[1]+t**3*d[1]) for t in [i/50 for i in range(51)]]
    points = curve(start,control1,control2,end) + curve(end,control3,control4,start)
    draw.polygon([(int(x*scale),int(y*scale)) for x,y in points],fill=color)
line([(54,80),(54,44)], '#497654'); line([(54,62),(35,43)], '#497654'); line([(54,53),(73,34)], '#497654')
leaf((52,43),(31,48),(29,21),(29,21),(29,21),(54,19),'#497654')
leaf((59,36),(57,16),(83,20),(83,20),(85,44),(59,43),'#a9c394')
leaf((41,57),(26,61),(22,43),(22,43),(41,40),(45,55),'#a9c394')
leaf((60,66),(58,49),(81,53),(81,53),(81,74),(60,73),'#497654')
for density,size in [('mdpi',48),('hdpi',72),('xhdpi',96),('xxhdpi',144),('xxxhdpi',192)]:
    directory = root / 'android/app/src/main/res' / f'mipmap-{density}'
    directory.mkdir(parents=True,exist_ok=True)
    for name in ['ic_launcher.png','ic_launcher_round.png']:
        image.resize((size,size),Image.Resampling.LANCZOS).save(directory/name)
print('Android launcher icons generated.')
