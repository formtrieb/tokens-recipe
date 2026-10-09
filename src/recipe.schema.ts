/**
 * The shape of a recipe, as a zod schema.
 *
 * Structural only: types, ranges, which sections exist. Which NAMES a section
 * must carry (the universal role names) stays in the
 * generator, which rejects a missing or invented name as "Rezept fehlerhaft".
 * The same schema goes out as JSON Schema (`tokens-recipe --schema`) for
 * editor validation, and an editor can build its form from it — the
 * descriptions (German, for designers) are the help texts there.
 */
import { z } from 'zod';

/**
 * a name the model uses as a key or a reference. Names end up in file names
 * (tokens/Shape/<Name>.json), CSS selectors and custom properties, and a
 * recipe can arrive by shared link — so only letters, digits, `.`, `_`, `-`,
 * starting with a letter or digit (no `/`, `..`, quotes, brackets, spaces)
 */
const name = z
  .string()
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/,
    'Name: Buchstaben, Ziffern, . _ - (beginnt mit Buchstabe oder Ziffer)',
  );
const hex = z
  .string()
  .regex(/^#[0-9a-f]{6}([0-9a-f]{2})?$/i, 'Hex-Farbe #rrggbb oder #rrggbbaa');
/*
 * Free CSS values: each one lands verbatim in a declaration (model.css, the
 * editor's <style>, a shared link), so each has a grammar — no `;`, braces,
 * `url()`, comments or escapes can get through to end the declaration.
 */
/** CSS length (`480px`, `66ch`, `40rem`) or a reference to another width role (`{column.lg}`) */
const cssLength = z
  .string()
  .regex(
    /^(\d+(\.\d+)?(px|rem|em|ch|%|vw|vh)|\{[a-z]+(\.[a-z]+)*\})$/,
    'Länge mit Einheit (px, rem, em, ch, %, vw, vh) oder Verweis {rolle.name}',
  );
/** box-shadow list: per shadow x y [blur [spread]] + hex colour, comma-separated; `none` */
const boxShadow = z
  .string()
  .regex(
    /^(none|(-?\d+(\.\d+)?(px)?\s+){2,4}#[0-9a-f]{6}([0-9a-f]{2})?(\s*,\s*(-?\d+(\.\d+)?(px)?\s+){2,4}#[0-9a-f]{6}([0-9a-f]{2})?)*)$/i,
    'box-shadow: je Schatten x y [blur [spread]] #hex, mehrere mit Komma; oder none',
  );
/** font stack: quoted or plain family names and generic families, comma-separated */
const fontStack = z
  .string()
  .regex(
    /^('[A-Za-z0-9 ._-]+'|"[A-Za-z0-9 ._-]+"|[A-Za-z][A-Za-z0-9-]*( [A-Za-z][A-Za-z0-9-]*)*)(\s*,\s*('[A-Za-z0-9 ._-]+'|"[A-Za-z0-9 ._-]+"|[A-Za-z][A-Za-z0-9-]*( [A-Za-z][A-Za-z0-9-]*)*))*$/,
    "Schriftstapel: Namen in '…' oder ohne Anführung, mit Komma getrennt",
  );
const px = z.number().int().nonnegative();
const unit = z.number().min(0).max(1);
const step = z.number().int().min(1);
const mode = <T extends z.ZodType>(t: T) => z.object({ light: t, dark: t });
const bezier = z
  .tuple([z.number(), z.number(), z.number(), z.number()])
  .describe('cubic-bezier: x1, y1, x2, y2');
const vizSlot = z
  .object({
    hue: name.describe('Ramp'),
    light: step.describe('Stufe in Light'),
    dark: step.describe('Stufe in Dark'),
  })
  .describe('eine Diagrammfarbe: Ramp und Stufe je Mode');
const typeStep = z
  .union([
    px,
    z.object({
      size: px.describe('Größe am großen Ende in px'),
      min: px
        .optional()
        .describe('Größe am kleinen Ende in px (skaliert dazwischen)'),
      cls: name
        .optional()
        .describe('eigene Zeilenhöhen-Klasse für diese Stufe'),
    }),
  ])
  .describe(
    'Schriftgröße in px, oder {size, min, cls} für eine skalierende Stufe',
  );

export const RecipeSchema = z
  .object({
    $schema: z.string().optional(),
    steps: z
      .literal(12)
      .describe(
        'Stufen je Ramp: immer 12, jede mit festem Namen (canvas, subtle, tint, tint-hover, tint-pressed, line-subtle, line, line-strong, fill, fill-hover, ink-subtle, ink). Frei sind die Werte je Stufe (Leitern, Farbton, Anker), nicht Anzahl und Namen.',
      ),
    chromaMax: z
      .number()
      .min(0)
      .max(0.4)
      .describe(
        'Obergrenze der Buntheit (OKLCH-Chroma). Jede Ramp nimmt davon ihren Anteil: chromaScale × Kurve.',
      ),
    hues: z
      .array(
        z.object({
          name: name.describe(
            'Name der Ramp (neutral, brand, accent, green …)',
          ),
          hue: z.number().min(0).max(360).describe('Farbton in Grad (OKLCH)'),
          chromaScale: z
            .number()
            .min(0)
            .describe(
              'Anteil an chromaMax (0 = grau). Ein Anker überschreibt ihn.',
            ),
          anchor: mode(
            z
              .object({
                step: step.describe('Stufe, die den Anker exakt trifft'),
                hex: hex.describe('die exakte Farbe, z. B. die Markenfarbe'),
              })
              .optional(),
          )
            .optional()
            .describe(
              'Feste Farbe je Mode, durch die die Ramp exakt läuft (Markenfarbe). Legt Farbton und Chroma der Ramp fest.',
            ),
        }),
      )
      .min(1)
      .describe(
        'Die Ramps der Foundation: je ein Farbton mit Buntheit. Was eine Ramp bedeutet, sagt semanticHues.',
      ),
    semanticHues: z
      .record(name, name)
      .describe(
        'Bedeutung → Ramp: neutral, brand, accent, positive, negative, warning, info. Die Namen sind in jedem DS gleich, die Zuordnung ist Sache des DS.',
      ),
    hierarchies: z
      .record(
        name,
        z.object({
          hue: name.describe('Farbton aus semanticHues, oder inverted'),
          style: name.describe(
            'Stil aus der Bibliothek: solid, outline, ghost, outline-hue, ghost-on-fill',
          ),
        }),
      )
      .describe(
        'Betonungsstufen aller Controls: brand, primary, secondary, tertiary, destructive, destructive-subtle, on-inverted — je ein Farbton und ein Stil.',
      ),
    modes: mode(
      z.object({
        lightness: z
          .array(unit)
          .describe(
            'Helligkeit je Stufe (OKLCH L, 0–1): Light fällt, Dark steigt',
          ),
        chromaCurve: z
          .array(unit)
          .describe('Anteil der Buntheit je Stufe (0–1), formt die Ramp'),
      }),
    ).describe('Leitern je Mode: wie hell und wie bunt jede Stufe ist.'),
    poles: mode(
      z.object({
        ink: hex.describe('Text und Icons (Light: Schwarz, Dark: fast Weiß)'),
        inkInverted: hex.describe('Inhalt auf inverted-Flächen'),
        paper: hex.describe('Karte, Panel, Top-Bar'),
        canvas: hex.describe('Seite'),
        overlay: hex
          .optional()
          .describe('Popover, Menü, Dialog (Dark: heller als paper)'),
        sunken: hex
          .optional()
          .describe('Senke in einer Fläche (Filterleiste, Code)'),
        scrim: hex.optional().describe('Abdunkelung hinter einem Modal (hex8)'),
      }),
    ).describe('Pole je Mode: die festen Farben außerhalb der Ramps.'),
    contract: z
      .object({
        textSteps: z
          .array(step)
          .describe(
            'Stufen, die als Text auf den Flächen-Stufen gelesen werden',
          ),
        surfaceSteps: z.array(step).describe('Stufen, die als Fläche gelten'),
        textMin: z
          .number()
          .positive()
          .describe('Mindestkontrast Text (WCAG 1.4.3: 4,5)'),
        strokeStep: step.describe(
          'Stufe mit Rand-Pflicht (bedeutungstragender Rand)',
        ),
        strokeMin: z
          .number()
          .positive()
          .describe(
            'Mindestkontrast für Rand, Icon, Fokus, Auswahl (WCAG 1.4.11: 3)',
          ),
        paperMinDeltaE: z
          .number()
          .nonnegative()
          .optional()
          .describe('Fläche 2 muss auf der Karte sichtbar bleiben (ΔE)'),
        solidStep: step.describe('Stufe der Füllung'),
        solidMin: z
          .number()
          .positive()
          .describe('Mindestkontrast für Text auf der Füllung (4,5)'),
        minDeltaL: unit.describe('Mindestabstand benachbarter Stufen (L)'),
        typeMinPx: px.optional().describe('kleinste Schriftgröße in px'),
        readingCh: z
          .tuple([z.number(), z.number()])
          .optional()
          .describe('Lesebreite min und max in ch (WCAG 1.4.8: höchstens 80)'),
        motionMaxMs: px
          .optional()
          .describe('längste UI-Bewegung in ms (Schleifen ausgenommen)'),
        identityMinDeltaE: z
          .number()
          .nonnegative()
          .optional()
          .describe('Kennfarben untereinander (ΔE × 100)'),
        legendMinDeltaE: z
          .number()
          .nonnegative()
          .optional()
          .describe('Diagrammfarben untereinander, jedes Paar (ΔE × 100)'),
        apcaTextLc: z
          .number()
          .nonnegative()
          .optional()
          .describe('APCA-Ziel für Text (Hinweis, kein Gate)'),
        apcaNonTextLc: z
          .number()
          .nonnegative()
          .optional()
          .describe('APCA-Ziel für Nicht-Text (Hinweis, kein Gate)'),
      })
      .describe(
        'Prüfschwellen. Die WCAG-Böden (textMin 4,5 · strokeMin 3 · solidMin 4,5 · Lesebreite ≤ 80 ch) darf ein Rezept verschärfen, nie unterschreiten.',
      ),
    onFill: mode(z.union([hex, z.literal('auto')]))
      .optional()
      .describe(
        'Inhalt auf einer Füllung je Mode: feste Farbe oder auto (Weiß oder Schwarz, je nach Kontrast).',
      ),
    alpha: mode(z.array(unit).min(1)).describe(
      'Alpha-Leiter je Mode (Foundation). Die Auswahl nennt nur die Stufennummer, siehe alphaSteps.',
    ),
    space: z
      .object({
        base: px.describe('Grundeinheit in px'),
        scale: z
          .array(px)
          .describe(
            'alle Größen der Foundation in px, benannt nach Wert (size.16)',
          ),
      })
      .describe(
        'Raster: Grundeinheit und Skala. Jede Abstands- und Radius-Angabe liegt darauf.',
      ),
    spaceRoles: z
      .object({
        gap: z
          .record(name, px)
          .describe(
            'wie eng zwei Dinge zusammengehören: tight · related · group · section · region',
          ),
        inset: z
          .record(name, px)
          .describe(
            'Abstand des Inhalts zur Kante: container · container-compact · list · page',
          ),
      })
      .describe('Abstands-Rollen in px, jede auf der Skala.'),
    border: z
      .object({
        width: z
          .record(name, px)
          .describe(
            'default (Feld, Karte, Trenner) · strong (Auswahl, aktiver Tab)',
          ),
      })
      .describe('Rahmenstärken in px.'),
    focus: z
      .object({
        ring: name.describe(
          'Auswahl-Name der Ringfarbe, z. B. pole.ink oder accent.fill',
        ),
        width: px.describe('Breite in px (WCAG 2.4.7: mindestens 2)'),
        offset: px.describe('Abstand zum Control in px'),
      })
      .describe(
        'Fokus-Ring. Der Vertrag prüft ihn mit ≥ 3:1 auf jeder Fläche.',
      ),
    width: z
      .record(name, z.union([cssLength, z.record(name, cssLength)]))
      .describe(
        'Breiten-Rollen als CSS-Längen: main, column.sm|md|lg, reading (ch), form, dialog.*, drawer, popover.*, tooltip, navigation.*. {column.lg} verweist auf eine andere Rolle.',
      ),
    breakpoints: z
      .record(name, px)
      .describe(
        'Viewport-Grenzen in px (min-width). Gehen auch als JSON und SCSS-Map raus, weil Media-Queries keine Variablen lesen.',
      ),
    elevation: mode(z.record(name, boxShadow))
      .optional()
      .describe(
        'Schatten je Mode und Ebene als box-shadow: raised, overlay, modal, sticky (sticky wird auf vier Kanten gedreht).',
      ),
    mark: z
      .object({
        hue: name.describe('Ramp des Suchtreffers (Bedeutungsname)'),
        ...mode(
          z.object({
            surface: z
              .tuple([name, unit])
              .describe('[Stufenname, Alpha] für die Trefferfläche'),
            current: z
              .tuple([name, unit])
              .describe('[Stufenname, Alpha] für den aktuellen Treffer'),
          }),
        ).shape,
      })
      .describe(
        'Suchtreffer (<mark>): Ramp und je Mode die Quelle für surface und current.',
      ),
    layer: z
      .object({
        sticky: z.number().int().describe('Tabellenkopf, Speicherleiste'),
        panel: z
          .number()
          .int()
          .describe(
            'nicht-modale Fläche über dem Inhalt, unter dem Rahmen: Seitenpanel, Inspektor',
          ),
        chrome: z
          .number()
          .int()
          .describe('App-Rahmen, wenn das Dokument scrollt'),
      })
      .describe(
        'z-index nur im Dokument. Alles Schwebende liegt im Top Layer und braucht keinen.',
      ),
    motion: z
      .object({
        character: name.describe('aktiver Charakter (productive · expressive)'),
        scale: z.array(px).describe('Dauern der Foundation in ms'),
        characters: z
          .record(
            name,
            z.object({
              curves: z
                .object({ standard: bezier, enter: bezier, exit: bezier })
                .describe('die drei Kurven'),
              spring: z
                .object({
                  damping: z.number().describe('Dämpfung 0–1'),
                  settle: z.number().describe('Einschwingzeit'),
                  points: z
                    .number()
                    .int()
                    .describe('Stützpunkte der linear()-Kurve'),
                })
                .optional()
                .describe('gedämpfte Feder, nur für Ort und Größe'),
              durations: z
                .record(name, px)
                .describe(
                  'Dauer je Rolle in ms (0 = sofort), jede auf der Skala',
                ),
              distance: z
                .object({ sm: px, md: px, lg: px })
                .describe('Weg je Overlay-Größe in px'),
              scale: z
                .object({
                  sm: z.number().optional(),
                  md: z.number().optional(),
                  lg: z.number().optional(),
                })
                .describe('Startskalierung großer Overlays (0.98 = kaum)'),
            }),
          )
          .describe('je Charakter: Kurven, Feder, Dauern, Weg, Skalierung'),
        reduced: z
          .object({
            loopFactor: z
              .number()
              .positive()
              .describe('Schleifen so viel langsamer bei reduzierter Bewegung'),
          })
          .describe('reduzierte Bewegung'),
      })
      .describe(
        'Bewegung: Charakter, Dauern-Skala und je Charakter Kurven, Feder, Dauer je Rolle, Weg.',
      ),
    radius: z
      .object({
        default: name.describe('die Form des DS (square · mixed · round)'),
        shapes: z
          .record(name, z.record(name, z.union([px, z.literal('round')])))
          .describe('je Form: Rolle → px auf der Skala, oder round'),
        sizeRatio: unit
          .optional()
          .describe(
            'die Ecke wächst mit der Control-Höhe, höchstens dieser Anteil',
          ),
      })
      .describe(
        'Eckenradius je Rolle. Andere Formen als default werden nur mitgeprüft.',
      ),
    type: z
      .object({
        families: z
          .record(name, fontStack)
          .describe('Schriftstapel: text · heading · code'),
        scale: z.array(px).describe('Schriftgrößen in px'),
        classes: z
          .record(name, z.number().positive())
          .describe('Zeilenhöhe als Faktor: head · read · ui · dense'),
        scaling: z
          .object({
            strategy: z
              .enum(['fluid', 'steps', 'fixed'])
              .describe('fluid · steps · fixed'),
            from: name.describe('Breakpoint, ab dem skaliert wird'),
            to: name.describe(
              'Breakpoint, an dem die große Größe erreicht ist',
            ),
          })
          .describe('wie skalierende Stufen zwischen zwei Breakpoints wachsen'),
        emphasis: z
          .object({
            subtle: z.number().int().describe('fester Schnitt für subtle'),
            strongStep: z
              .number()
              .int()
              .describe('strong = Schnitt der Rolle + diese Stufe'),
            max: z.number().int().describe('Deckel für strong'),
          })
          .describe('Betonung als Regel, nicht je Rolle'),
        tracking: z
          .object({
            anchors: z
              .array(z.tuple([px, z.number()]))
              .describe('[px, em] — Sperrung nach Größe, linear dazwischen'),
            weightBonus: z
              .object({
                from: z.number().int().describe('ab diesem Schnitt'),
                amount: z.number().describe('Bonus in em bei `at`'),
                at: px.describe('bei dieser Größe voll'),
                until: px.describe('bis hier auf 0 abfallend'),
              })
              .describe('Bonus für fette kleine Schrift'),
            uppercase: z.number().describe('Bonus für Versalien in em'),
          })
          .describe(
            'Sperrung als Regel: Kurve nach Größe, Bonus für fett und Versalien',
          ),
        prose: z
          .record(name, z.number())
          .describe(
            'Fließtext-Rhythmus in em: paragraph, list, heading-before, heading-after',
          ),
        inline: z
          .record(name, z.number())
          .describe('Inline-Merkmale in em: code, sup'),
        roles: z
          .record(
            name,
            z.object({
              cls: name.describe('Zeilenhöhen-Klasse'),
              family: name.optional().describe('Schriftstapel, Standard text'),
              weight: z.number().int().describe('Schnitt'),
              case: z
                .enum(['uppercase', 'lowercase', 'capitalize', 'none'])
                .optional()
                .describe('uppercase für Versalien'),
              numeric: z.boolean().optional().describe('Tabellenziffern'),
              emphasis: z
                .array(z.enum(['subtle', 'strong']))
                .optional()
                .describe('welche Betonungen die Rolle hat'),
              steps: z.record(name, typeStep).describe('Stufen der Rolle'),
            }),
          )
          .describe(
            'Rollen: was der Text ist (display, heading, title, body, label …)',
          ),
      })
      .describe(
        'Typografie: Schriftfamilien, eine Größenskala, Zeilenhöhen-Klassen, Skalierung, Betonung, Sperrung, Prosa-Rhythmus und die Rollen mit ihren Stufen.',
      ),
    control: z
      .object({
        sizes: z
          .record(
            name,
            z.object({
              height: px.describe('Mindesthöhe in px'),
              icon: px.describe('Icon in px'),
              label: name.describe(
                'Textstufe für Aktionen und Chips (label.*)',
              ),
              read: name.describe(
                'Textstufe für Felder und Zeilen (value/option.*)',
              ),
              gap: px.describe('Lücke Icon ↔ Text in px'),
              content: px.describe('Innenabstand der Inhalts-Familie in px'),
            }),
          )
          .describe('je Größe (xs, sm, md, lg) das Bündel'),
        icons: z.array(px).describe('Icon-Stufen in px'),
        rules: z
          .object({
            actionInset: px.describe('Aktions-Innenabstand = Höhe/2 − dies'),
            iconSide: px.describe('Icon-Seite = Innenabstand − dies'),
            pill: px.describe('Zuschlag für runde Formen'),
            plainGap: px.describe('ohne Fläche eine engere Lücke'),
            aloneRand: px.describe('Rand um ein Icon allein'),
          })
          .describe('Regeln, aus denen die Innenmaße folgen'),
        target: z
          .object({
            fine: px.describe('Maus'),
            coarse: px.describe('Touch (44)'),
          })
          .describe('kleinste Trefferfläche je Zeiger in px'),
        coarse: z
          .object({
            stepUp: z
              .number()
              .int()
              .describe('so viele Größen höher bei grobem Zeiger'),
            replace: z
              .record(name, name)
              .describe('Größen, die ganz zu einer anderen werden (xs → sm)'),
          })
          .describe('grober Zeiger (pointer: coarse)'),
        badge: z
          .record(
            name,
            z.object({
              height: px.describe('Höhe in px'),
              text: name.describe('caption-Stufe'),
            }),
          )
          .describe('Badges unterhalb xs, nicht interaktiv'),
        badgeDot: px.optional().describe('Status-Punkt ohne Text in px'),
      })
      .describe(
        'Control-Größen als Bündel: Höhe, Icon, Textstufen, Lücke, Innenabstand, Regeln, Trefferflächen, grober Zeiger, Badges.',
      ),
    dataviz: z
      .object({
        categorical: z
          .array(vizSlot)
          .describe('Kategorien in fester Reihenfolge'),
        other: vizSlot.describe('alles jenseits der Liste (grau)'),
        sequential: z
          .object({
            hue: name.describe('Ramp'),
            light: z
              .array(step)
              .describe('Stufen in Light, von leise nach kräftig'),
            dark: z.array(step).describe('Stufen in Dark'),
          })
          .describe('sequenziell: Klassen eines Farbtons'),
        diverging: z
          .object({
            neutral: z
              .object({ low: name, high: name })
              .describe('darüber/darunter ohne Wertung'),
            rated: z
              .object({ low: name, high: name })
              .describe('schlechter/besser (Rot ↔ Grün, mit Vorzeichen)'),
            arm: mode(z.array(step)).describe(
              'Stufen je Arm, 1 = neben der Mitte',
            ),
            mid: vizSlot.describe('die graue Mitte'),
          })
          .describe('divergierend: zwei Angebote auf denselben Arm-Stufen'),
        marks: z
          .object({
            line: px.describe('Linienstärke'),
            gap: px.describe('Lücke zwischen Füllungen'),
            marker: px.describe('Punktgröße'),
          })
          .describe('Marken in px auf der Skala'),
      })
      .describe(
        'Diagrammfarben: eigene Liste, nicht die UI-Farbtöne. Der Vertrag prüft Fehlsicht und Legenden-Abstand.',
      ),
    icon: z
      .object({
        text: z
          .record(z.string().regex(/^\d+$/, 'Schriftgröße in px, nur Ziffern'), px)
          .describe('Schriftgröße px → Icon px neben diesem Text'),
        spot: z.record(name, px).describe('Spot-Icons ohne Text: sm · md · lg'),
      })
      .describe('Icons außerhalb von Controls.'),
    avatar: z
      .object({
        sizes: z.record(name, px).describe('Avatar-Größen in px auf der Größenskala: xs · sm · md'),
      })
      .describe(
        'Avatare: Spot-Größen ohne Text und ohne Coarse-Sprung. Ein Avatar als Button nimmt die Control-Höhe.',
      ),
    link: z
      .object({
        underline: z
          .object({
            offset: z
              .number()
              .min(0)
              .describe('Abstand der Linie zur Schrift in em'),
            thickness: z
              .enum(['default', 'strong'])
              .describe('Stärke in Ruhe: eine Rahmenbreite (border.width)'),
            thicknessHover: z
              .enum(['default', 'strong'])
              .describe(
                'Stärke bei Hover und Pressed: eine Rahmenbreite (border.width)',
              ),
          })
          .describe('Unterstrich: Abstand und Stärke; die Farbe erbt er vom Text'),
      })
      .describe(
        'Link im Text: Typografie des Inline-Texts, keine Kontroll-Fläche. Die Stärken folgen den Rahmenbreiten.',
      ),
    identity: z
      .object({
        hues: z.array(name).describe('Ramps in Hash-Reihenfolge'),
        strong: z
          .object({ surface: step.describe('Stufe der Füllung') })
          .describe('kräftig: Füllung + on-fill'),
        subtle: z
          .object({
            surface: step.describe('leise Fläche'),
            content: step.describe('Text darauf'),
            indicator: step.describe('Punkt'),
          })
          .describe('leise: Fläche, Text, Punkt'),
      })
      .describe(
        'Kennfarben für Avatare und Nutzer-Labels: ohne Bedeutung, nur Unterscheidung.',
      ),
    alphaSteps: z
      .record(name, step)
      .describe(
        'Welche Alpha-Stufe jeder transparente Auswahl-Eintrag liest (Standard aus defaults.json).',
      ),
    status: z
      .object({
        strong: z
          .record(name, name)
          .describe('surface · content · indicator → Stufenname'),
        subtle: z
          .record(name, name)
          .describe('surface · content · indicator → Stufenname'),
      })
      .describe(
        'Status-Rolle (Chip, Badge, Kennzahl): Stufenname je Part und Betonung (Standard).',
      ),
    feedback: z
      .record(name, name)
      .describe(
        'Feedback-Rolle (Alert, Feldmeldung): surface · line · content · icon → Stufenname (Standard).',
      ),
  })
  .strict()
  .superRefine((r, ctx) => {
    for (const m of ['light', 'dark'] as const)
      for (const k of ['lightness', 'chromaCurve'] as const)
        if (r.modes[m][k].length !== r.steps)
          ctx.addIssue({
            code: 'custom',
            path: ['modes', m, k],
            message: `${r.modes[m][k].length} Werte, steps ist ${r.steps}`,
          });
    if (r.alpha.light.length !== r.alpha.dark.length)
      ctx.addIssue({
        code: 'custom',
        path: ['alpha'],
        message: 'Alpha-Leiter in beiden Modes gleich lang',
      });
  });

export type RecipeShape = z.infer<typeof RecipeSchema>;
