---
subject: "[Novedades Dr. Z Academy] Título principal del correo"
---
<!--
Para previsualizar este newsletter en el navegador:
make notify-preview-newsletter FILE=notify/news-template.md

Para probar enviándolo solo a ciertos correos:
make notify-send-newsletter FILE=notify/news-template.md TEST_EMAILS=tucorreo@gmail.com,otro@gmail.com

Para enviarlo a toda la base de datos:
make notify-send-newsletter FILE=notify/news-template.md
-->
<div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; color: #333; line-height: 1.6;">

<!-- Banner -->
<div style="text-align: center; margin-bottom: 20px;">
  <img src="https://drz-academy.github.io/assets/banner-newsletter.webp" alt="Dr. Z Academy Newsletter" style="max-width: 100%; border-radius: 10px;">
</div>

<!-- Contenido Principal -->
<h2 style="text-align: center; color: #555; font-style: italic; margin-bottom: 30px;">Novedades del [Día] de [Mes] de [Año]</h2>

<!-- Novedad 1 -->
<div style="border: 1px solid #e1e4e8; border-radius: 8px; padding: 25px; margin-bottom: 30px; background-color: #ffffff; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
  <h3 style="color: #2c3e50; margin-top: 0; font-size: 22px; border-bottom: 2px solid #f0f0f0; padding-bottom: 10px; margin-bottom: 20px;">Título de la Primera Novedad Principal</h3>

  <p>Este es el texto principal de la primera novedad. Aquí puedes contar historias, anunciar nuevos cursos, o hablar de algún evento reciente. Puedes incluir texto en <strong>negrita</strong> y enlaces a páginas externas como <a href="https://drz-academy.github.io/" style="color: #0056b3;">drz-academy.github.io</a>.</p>

  <p>Un segundo párrafo para dar más detalles. Explica por qué es relevante y qué esperas que haga el lector a continuación.</p>

  <div style="text-align: center; margin: 30px 0 10px 0;">
    <a href="https://drz-academy.github.io/" style="background-color: #2c3e50; color: #ffffff; text-decoration: none; padding: 12px 25px; border-radius: 5px; font-weight: bold; display: inline-block;">Llamado a la acción (Botón)</a>
  </div>
</div>

<!-- Novedad 2 -->
<div style="border: 1px solid #e1e4e8; border-radius: 8px; padding: 25px; margin-bottom: 30px; background-color: #ffffff; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
  <h3 style="color: #2c3e50; margin-top: 0; font-size: 22px; border-bottom: 2px solid #f0f0f0; padding-bottom: 10px; margin-bottom: 20px;">Título de una Segunda Novedad</h3>

  <p>Otra noticia interesante o un recordatorio sobre algo importante. Cada caja como esta separa visualmente las diferentes piezas de información que quieres compartir.</p>

  <ul>
    <li>Punto importante uno</li>
    <li>Punto importante dos</li>
    <li>Punto importante tres</li>
  </ul>
</div>

<hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

<!-- Cursos Activos -->
<h3 style="text-align: center; color: #2c3e50; margin-bottom: 20px;">Explora nuestros cursos activos</h3>

<table width="100%" cellpadding="10" cellspacing="0" border="0" style="margin-bottom: 30px;">
  <tr>
    <td width="30%" valign="top" style="padding-bottom: 20px;">
      <a href="https://drz-academy.github.io/cursos/python-fin-del-mundo/">
        <img src="https://drz-academy.github.io/cursos/python-fin-del-mundo/images/header.png" alt="Python para el fin del mundo" width="150" style="max-width: 100%; border-radius: 5px;">
      </a>
    </td>
    <td width="70%" valign="top" style="padding-bottom: 20px;">
      <h4 style="margin: 0 0 10px 0; color: #2c3e50;">Python para el fin del mundo</h4>
      <p style="margin: 0 0 10px 0; font-size: 14px; color: #555;">Curso práctico para aprender Python aplicado a la astronomía: datos orbitales reales, visualización, machine learning y desarrollo de una web app.</p>
      <a href="https://drz-academy.github.io/cursos/python-fin-del-mundo/" style="font-size: 14px; color: #0056b3; font-weight: bold; text-decoration: none;">Ver más información →</a>
    </td>
  </tr>
  <tr>
    <td width="30%" valign="top" style="padding-bottom: 20px;">
      <a href="https://drz-academy.github.io/cursos/cuantica-a-pie/">
        <img src="https://drz-academy.github.io/cursos/cuantica-a-pie/images/header.png" alt="Cuántica a Pie con Dr. Z" width="150" style="max-width: 100%; border-radius: 5px;">
      </a>
    </td>
    <td width="70%" valign="top" style="padding-bottom: 20px;">
      <h4 style="margin: 0 0 10px 0; color: #2c3e50;">Cuántica a Pie con Dr. Z</h4>
      <p style="margin: 0 0 10px 0; font-size: 14px; color: #555;">Curso virtual de mecánica cuántica con Dr. Z: superposición, entrelazamiento, computación cuántica e interpretaciones, sin ecuaciones complicadas.</p>
      <a href="https://drz-academy.github.io/cursos/cuantica-a-pie/" style="font-size: 14px; color: #0056b3; font-weight: bold; text-decoration: none;">Ver más información →</a>
    </td>
  </tr>
  <tr>
    <td width="30%" valign="top" style="padding-bottom: 20px;">
      <a href="https://drz-academy.github.io/cursos/astropython/">
        <img src="https://drz-academy.github.io/cursos/astropython/images/header.png" alt="AstroPython" width="150" style="max-width: 100%; border-radius: 5px;">
      </a>
    </td>
    <td width="70%" valign="top" style="padding-bottom: 20px;">
      <h4 style="margin: 0 0 10px 0; color: #2c3e50;">AstroPython</h4>
      <p style="margin: 0 0 10px 0; font-size: 14px; color: #555;">Curso virtual para iniciarte en Python con ejemplos de astronomía y astrofísica: gráficos, datos, simulaciones e inteligencia artificial.</p>
      <a href="https://drz-academy.github.io/cursos/astropython/" style="font-size: 14px; color: #0056b3; font-weight: bold; text-decoration: none;">Ver más información →</a>
    </td>
  </tr>
  <tr>
    <td width="30%" valign="top" style="padding-bottom: 20px;">
      <a href="https://drz-academy.github.io/cursos/extraterrestres/">
        <img src="https://drz-academy.github.io/cursos/extraterrestres/images/header.png" alt="Extraterrestres" width="150" style="max-width: 100%; border-radius: 5px;">
      </a>
    </td>
    <td width="70%" valign="top" style="padding-bottom: 20px;">
      <h4 style="margin: 0 0 10px 0; color: #2c3e50;">Extraterrestres</h4>
      <p style="margin: 0 0 10px 0; font-size: 14px; color: #555;">De los aspectos culturales al análisis científico de la existencia y contacto con civilizaciones extraterrestres.</p>
      <a href="https://drz-academy.github.io/cursos/extraterrestres/" style="font-size: 14px; color: #0056b3; font-weight: bold; text-decoration: none;">Ver más información →</a>
    </td>
  </tr>
</table>

<hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

<!-- Firma -->
<div style="text-align: center; margin-top: 30px; margin-bottom: 30px;">
  <a href="https://drz-academy.github.io/">
    <img src="https://drz-academy.github.io/assets/DrZ-Logos/logo-firma.webp" alt="Dr. Z Academy" width="150" style="margin-bottom: 15px;">
  </a>
  <div style="text-align: center;">
    <a href="https://instagram.com/dr.zacademy" style="text-decoration: none; color: #0056b3; display: inline-block; margin-right: 15px;">
      <img src="https://drz-academy.github.io/assets/instagram-25x25.png" alt="Instagram" width="25" style="vertical-align: middle; margin-right: 5px;">
      <span style="vertical-align: middle; font-weight: bold;">@dr.zacademy</span>
    </a>
    <a href="https://wa.me/573002422052" style="text-decoration: none; color: #0056b3; display: inline-block;">
      <img src="https://drz-academy.github.io/assets/whatsapp-25x25.png" alt="WhatsApp" width="25" style="vertical-align: middle; margin-right: 5px;">
      <span style="vertical-align: middle; font-weight: bold;">+57 300 2422052 (@drz.academy)</span>
    </a>
  </div>
</div>
</div>

<p style="text-align: center; font-size: 12px; font-style: italic; color: #777; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
  Si recibiste este correo de un correo distinto a soydoctorz@gmail.com, puedes también <a href="https://drz-academy.github.io/?subscribe=open" style="color: #0056b3; text-decoration: underline;">suscribirte para recibir nuevas novedades de la Dr.Z Academy</a>
</p>

</div>
