// CV template. All content comes from ../cv.yaml; this file is layout only.
// Build:  typst compile --root . --input lang=en content/cv/cv.typ web/public/cv/cv-en.pdf
// (GitHub Actions does this automatically when cv.yaml changes.)

#let lang = sys.inputs.at("lang", default: "en")
#let cv = yaml("../cv.yaml")

// A field is either plain text (same in both languages) or (en: .., de: ..).
#let tr(value) = if type(value) == dictionary { value.at(lang) } else { str(value) }

#let labels = (
  en: (education: "Education", experience: "Experience", projects: "Projects", skills: "Skills", languages: "Languages", present: "present"),
  de: (education: "Ausbildung", experience: "Berufserfahrung", projects: "Projekte", skills: "Kenntnisse", languages: "Sprachen", present: "heute"),
).at(lang)

#let months = (
  en: ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"),
  de: ("Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sep.", "Okt.", "Nov.", "Dez."),
).at(lang)

// "2024-10" -> "Oct 2024"; "present" -> "present"/"heute"
#let date(value) = {
  let s = str(value)
  if s == "present" { labels.present } else {
    let parts = s.split("-")
    months.at(int(parts.at(1)) - 1) + " " + parts.at(0)
  }
}
#let period(item) = date(item.start) + " – " + date(item.end)

#set document(title: cv.person.name + " – CV", author: cv.person.name)
#set page(paper: "a4", margin: (x: 1.8cm, y: 1.6cm))
#set text(font: "Libertinus Serif", size: 10.5pt, lang: lang)
#set par(justify: false, leading: 0.6em)
#show link: set text(fill: rgb("#1a4f8b"))

#let section(title) = {
  v(0.7em)
  text(size: 11.5pt, weight: "bold", tracking: 0.06em, upper(title))
  v(-0.55em)
  line(length: 100%, stroke: 0.5pt)
  v(-0.15em)
}

// Left: bold title + detail. Right: dates / place.
#let entry(title, subtitle, right-top, right-bottom) = grid(
  columns: (1fr, auto),
  row-gutter: 0.45em,
  text(weight: "bold", title), align(right, right-top),
  emph(subtitle), align(right, emph(right-bottom)),
)

// ---- Header ----------------------------------------------------------------
#align(center)[
  #text(size: 22pt, weight: "bold", cv.person.name) \
  #v(-0.3em)
  #tr(cv.person.location) · #link("mailto:" + cv.person.email, cv.person.email) \
  #link(cv.person.links.github, cv.person.links.github.replace("https://", "")) ·
  #link(cv.person.links.linkedin, cv.person.links.linkedin.replace("https://www.", ""))
]

// ---- Education -------------------------------------------------------------
#section(labels.education)
#for item in cv.education {
  entry(item.institution, tr(item.degree), period(item), tr(item.location))
  if "grade" in item [#tr(item.grade) \ ]
  if "details" in item [#tr(item.details)]
  v(0.3em)
}

// ---- Experience ------------------------------------------------------------
#section(labels.experience)
#for item in cv.experience {
  entry(item.company, tr(item.role), period(item), tr(item.location))
  list(..item.bullets.map(b => tr(b)))
  v(0.3em)
}

// ---- Projects --------------------------------------------------------------
#section(labels.projects)
#for item in cv.cv_projects {
  text(weight: "bold", tr(item.name))
  h(0.6em)
  text(size: 9.5pt, emph(item.tech.join(", ")))
  list(..item.bullets.map(b => tr(b)))
  v(0.2em)
}

// ---- Skills ----------------------------------------------------------------
#section(labels.skills)
#grid(
  columns: (auto, 1fr),
  column-gutter: 1em,
  row-gutter: 0.6em,
  ..cv.skills.map(group => (
    text(weight: "bold", tr(group.group)),
    group.items.map(i => tr(i)).join(", "),
  )).flatten()
)

// ---- Languages -------------------------------------------------------------
#section(labels.languages)
#cv.languages.map(l => tr(l.name) + " (" + tr(l.level) + ")").join(" · ")
