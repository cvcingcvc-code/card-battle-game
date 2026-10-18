"""Original vector illustrations for the local card battle prototype.

No fonts, external images, or remote resources are used. Run this file, then
render.js with the workspace's Playwright installation to regenerate the PNGs.
"""
from pathlib import Path
import math

ROOT = Path(__file__).resolve().parent


def svg(body, width=400, height=500, accent="#c8a66a", shade="#243830"):
    defs = f'''<defs>
      <linearGradient id="bg" x2="0" y2="1"><stop stop-color="{shade}"/><stop offset="1" stop-color="#0b1116"/></linearGradient>
      <radialGradient id="aura"><stop stop-color="{accent}" stop-opacity=".18"/><stop offset="1" stop-color="{accent}" stop-opacity="0"/></radialGradient>
      <linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#cbd4ce"/><stop offset=".36" stop-color="#778d89"/><stop offset="1" stop-color="#273e43"/></linearGradient>
      <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#e4c58a"/><stop offset="1" stop-color="#8f683d"/></linearGradient>
      <linearGradient id="cloak" x2=".8" y2="1"><stop stop-color="{accent}"/><stop offset="1" stop-color="{shade}"/></linearGradient>
      <linearGradient id="fade" x2="0" y2="1"><stop offset=".68" stop-color="#0b1116" stop-opacity="0"/><stop offset="1" stop-color="#0b1116" stop-opacity=".95"/></linearGradient>
    </defs>'''
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">{defs}{body}</svg>'


def backdrop(accent):
    stars = [(36, 91, 1), (85, 37, 1.3), (321, 73, 1), (358, 165, 1.5), (58, 292, 1.4), (344, 348, 1), (284, 30, 1), (23, 382, 1)]
    return f'''<path fill="url(#bg)" d="M0 0h400v500H0z"/>
    <ellipse cx="202" cy="217" rx="210" ry="220" fill="url(#aura)"/>
    <circle cx="200" cy="201" r="139" fill="none" stroke="{accent}" stroke-opacity=".17"/>
    <path d="M63 201a137 137 0 0 1 274 0M200 53v16M200 332v17M47 201h18M336 201h17" fill="none" stroke="{accent}" stroke-opacity=".4" stroke-width="1"/>
    <path d="M200 61l5 8-5 8-5-8zM60 201l5-5 5 5-5 5zM330 201l5-5 5 5-5 5z" fill="{accent}" opacity=".45"/>
    {''.join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{accent}" opacity=".4"/>' for x,y,r in stars)}
    <path fill="#101c21" d="M0 427l60-90 48 44 50-76 47 60 60-42 65 47 70-65v195H0z"/>
    <path fill="#0c151a" d="M0 466l89-61 73 33 64-35 86 30 88-41v108H0z"/>'''


def card(name, body, accent, shade):
    final = backdrop(accent) + body + '<path fill="url(#fade)" d="M0 0h400v500H0z"/>'
    (ROOT / f"{name}.svg").write_text(svg(final, accent=accent, shade=shade))


card("dragon", '''
  <path fill="#4f3031" d="M138 306L22 217l29 99-20 28 91 23zM253 298l125-118-27 132 22 34-119 37z"/>
  <path fill="#8e5146" d="M142 300L35 230l47 82-32 27 94 23zM252 310l113-108-40 112 31 24-106 37z"/>
  <path fill="#392a2b" d="M140 301l-58 11 48-54zM282 297l43 17-13-64z"/>
  <path fill="#b37a5c" d="M119 379l14-99 27-15 7-78 70-25 45 54-17 48 15 89 40 87-191 6z"/>
  <path fill="#8d4c41" d="M111 432l20-103 24-26 11-85 45-52 36 12 18 72-35 63 44 121z"/>
  <path fill="#6b3835" d="M174 220l-24-33 6-51 20 19 15 53zM226 193l29-49 26 9-21 57z"/>
  <path fill="#d0ad77" d="M158 173l-5-64 39 55-16 27zM231 169l35-68-4 76-18 22z"/>
  <path fill="#e0c28a" d="M153 109l11 35 10 14-1 13zM266 101l-7 45-13 19z"/>
  <path fill="#c27b5b" d="M151 211l55-50 47 22 16 46 42 20-4 32-54 29-58-25-20-31z"/>
  <path fill="#de9b72" d="M151 211l55-50 15 43-37 31z"/>
  <path fill="#9d5948" d="M221 204l32-21 16 46 42 20-47 13-40-24z"/>
  <path fill="#703a36" d="M175 254l49-16 40 24 43-13-4 27-54 16-40-9z"/>
  <path d="M233 268l30 8 27-12" fill="none" stroke="#33282c" stroke-width="6" stroke-linejoin="round"/>
  <path fill="#e8c689" d="M247 277l7 17 6-17M278 270l6 15 5-19"/>
  <path fill="#392a2b" d="M182 224l34-13 8 17-29 7z"/>
  <path fill="#f0d690" d="M192 224l21-6-3 11-15 1z"/>
  <path fill="#412b2b" d="M205 219l1 11 5-1 2-11zM288 249l10-3 3 8-12 2z"/>
  <path fill="#d8ad78" d="M166 296l31 15 18 33-23 18-34-28zM155 345l37 17 25 42-40 18-32-30zM178 430l39-26 14 36z"/>
  <path fill="#ac7859" d="M196 311l24-6-4 39zM192 362l37-16-12 58z"/>
  <path fill="#d6ae75" d="M136 304l-17 31 29-10zM126 348l-20 33 32-10zM269 316l26 19-22 8zM281 355l28 25-27 7z"/>
  <path d="M84 313l44 27M326 313l-48 29M181 207l19-12" fill="none" stroke="#dc9b73" stroke-opacity=".45" stroke-width="2"/>
  <g fill="#dcaf71" opacity=".75"><path d="M78 391l3-5 3 5-3 5zM315 151l2-4 2 4-2 4zM340 407l3-6 3 6-3 6z"/></g>
''', "#d98a79", "#38262a")

card("archer", '''
  <path d="M281 128l-11 197" stroke="#a27d4c" stroke-width="9"/>
  <path fill="#c8a66a" d="M274 132l8-38 6 40-7-7z"/>
  <path fill="#788b76" d="M267 164l-8-24 15 6 9-19-3 31z"/>
  <path fill="#243e39" d="M61 459l28-103 54-37 99 9 68 41 30 90z"/>
  <path fill="#456d58" d="M78 453l24-96 51-37 45 39-38 96zM199 359l41-36 62 46 17 86H229z"/>
  <path fill="#6d9170" d="M93 355l63-40 37 41-36 33zM199 358l41-36 47 31-51 27z"/>
  <path fill="#20352f" d="M142 357l22 87 39-14-11-76z"/>
  <path fill="#b29772" d="M172 279h55v57l-28 31-31-34z"/>
  <path fill="#b5ba94" d="M154 228l-43-27 17 54 35 12zM240 225l47-25-21 52-29 11z"/>
  <path fill="#dbb894" d="M154 224l11 67 34 30 36-27 14-65-49-44z"/>
  <path fill="#bd9777" d="M201 184l48 45-14 65-36 27 5-50z"/>
  <path fill="#75a592" d="M144 239l-7-50 29-44 55-9 44 40-14 80-16-37-37-18-28 27z"/>
  <path fill="#a2c1a0" d="M151 204l15-47 55-10-33 43z"/>
  <path fill="#395e4d" d="M137 242l-2-66 31-39 58-11 49 46-16 90-10-52-19-28-41-1-28 34z"/>
  <path fill="#577e60" d="M135 176l31-39 58-11-35 42-35 36z"/>
  <path fill="#253c35" d="M199 151l25-25 49 46-16 90-17-78z"/>
  <path fill="#567f67" d="M138 246l8-29 17 34-8 65-35 36zM239 232l18-19 8 55-17 57-19-21z"/>
  <path fill="#172c2a" d="M164 250l23-2-3 6-17 1zM212 247l23-2-3 7-17 1z"/>
  <path fill="#8fc8b0" d="M171 249l8 1-3 4-6-1zM218 248l9-1-3 5-7 1z"/>
  <path d="M196 255l-6 20 12 1M184 289l20 1" fill="none" stroke="#866d58" stroke-width="2"/>
  <path fill="#c8a66a" d="M182 339l17 15 16-15 4 23-21 18-21-17z"/>
  <path fill="#b3d3ba" d="M198 346l8 14-8 11-8-11z"/>
  <path d="M137 348l126 93" stroke="#483f30" stroke-width="19"/>
  <path d="M137 348l126 93" stroke="#9f8152" stroke-width="12"/>
  <path fill="#d3b980" d="M186 381l14-15 17 12-14 16z"/>
  <path d="M326 164Q235 294 324 436" fill="none" stroke="#c8a66a" stroke-width="8"/>
  <path d="M328 164l-3 272" fill="none" stroke="#ddd1ab" stroke-width="1.5"/>
  <path d="M326 169Q263 291 324 431" fill="none" stroke="#6d7555" stroke-width="3"/>
  <path fill="#b7b991" d="M110 399l16-19 16 13-5 14-21 9z"/>
  <path fill="#c8a66a" d="M117 396l-6 38 25-31z"/>
''', "#8fc8b0", "#20372f")

card("gargoyle", '''
  <path fill="#263b43" d="M148 276L35 125l8 121-24 57 73-20-6 73 64-49zM250 274l111-152-6 124 27 58-72-21 4 71-67-43z"/>
  <path fill="#52706d" d="M147 274L47 147l18 99-29 43 62-23 6 60 45-35zM252 274l99-129-17 103 29 39-63-23-1 63-46-37z"/>
  <path fill="#375353" d="M65 246l35-9-3-24-50-66zM334 248l-35-8 7-27 45-68z"/>
  <path d="M50 153l99 135M65 245l82 42M103 318l43-31M348 150l-97 138M333 246l-80 41M299 320l-47-33" stroke="#89a19a" stroke-opacity=".4" stroke-width="2" fill="none"/>
  <path fill="#3d5557" d="M100 438l10-101 48-51 75-7 56 48 15 111z"/>
  <path fill="#627d77" d="M106 365l53-78 40 28-23 69-50 29zM202 316l31-37 56 48 3 73-57-15z"/>
  <path fill="#879a8c" d="M159 288l40 27-53 19zM233 279l56 48-50 8-37-19z"/>
  <path fill="#344b4e" d="M176 382l26-66 33 69-26 66z"/>
  <path fill="#607d74" d="M127 199l12-67 41 37 41-6 41-40 12 73-30 94-47 30-43-32z"/>
  <path fill="#a0ac94" d="M139 132l41 37-29 28zM262 123l-2 61-26-17z"/>
  <path fill="#7d9489" d="M151 197l42-31 41 1 26 17-19 27-36 18-43-10z"/>
  <path fill="#526f69" d="M127 199l35 20 43 10-10 91-41-32z"/>
  <path fill="#2d484c" d="M205 229l36-18 33-15-30 94-47 30z"/>
  <path fill="#273c43" d="M145 221l45 11-14 18-28-10zM215 233l40-16-4 22-29 14z"/>
  <path fill="#9fddc8" d="M153 228l28 6-9 8-18-7zM224 236l23-10-2 11-18 8z"/>
  <path fill="#a0ad97" d="M198 220l-12 41 20 5 10-7z"/>
  <path fill="#162e36" d="M164 273l32-8 37 6-15 23-27 4z"/>
  <path fill="#a0b1a2" d="M171 273l8 15 5-18zM217 272l4 15 8-15z"/>
  <path fill="#718779" d="M104 367l-31 43 17 37 50-5 28-35-26-40zM272 365l47 39-9 42-53-1-26-40 24-32z"/>
  <path fill="#bac1a5" d="M82 422l-9 32 17-8 8-23zM103 425l-4 27 15-8 4-22zM296 423l1 29 15-8-3-24zM314 419l8 29 12-2-9-30z"/>
  <path d="M155 179l12 23-8 14M229 173l-9 18 12 13M116 343l21 14-7 17M255 333l-9 22 19 8" fill="none" stroke="#273f44" stroke-width="3"/>
  <g fill="#83977b"><path d="M123 338l-5 17 13-5 4-11zM251 185l5 15-13 5-1-13zM157 286l8 9-9 10-9-11z"/></g>
''', "#9bb8ae", "#24343b")

card("knight", '''
  <path fill="#493b2d" d="M99 327l-31 131h269l-31-132-94-27z"/>
  <path fill="#8c6d42" d="M100 330L78 458h64l38-139zM235 315l45 143h46l-22-131z"/>
  <path fill="#c8a66a" d="M100 330l42 128 10-96 28-43z"/>
  <path fill="#42575b" d="M123 330l50-28h62l43 28-15 119H139z"/>
  <path fill="url(#metal)" d="M143 328l32-26h58l30 24-11 80-52 39-48-40z"/>
  <path fill="#a0b1a8" d="M143 328l57 34-48 43z"/>
  <path fill="#456067" d="M200 362l63-36-11 80-52 39z"/>
  <path fill="url(#gold)" d="M174 351l27-12 28 12-8 39-21 21-20-21z"/>
  <path fill="#315051" d="M200 350l16 9-5 25-11 12-10-12-5-25z"/>
  <path fill="#92c5b0" d="M200 355l7 18-7 15-7-15z"/>
  <path fill="url(#metal)" d="M72 332l50-24 35 16-13 48-56 13-29-22zM247 324l34-17 53 26 13 31-32 23-57-17z"/>
  <path fill="#c8a66a" d="M71 331l51-23 34 15-5 12-30-14-45 22zM247 324l34-17 53 26 5 12-58-23-29 15z"/>
  <path fill="#253d44" d="M87 386l55-15-11 71H92zM259 371l56 16-5 55-42-1z"/>
  <path fill="#758e8a" d="M173 293l-3 30 30 22 33-24-3-28z"/>
  <path fill="#344f56" d="M200 302v42l33-23-3-28z"/>
  <path fill="#c8a66a" d="M167 169l17-46 29-18 17 63z"/>
  <path fill="#e0c48c" d="M184 123l29-18-4 66-23 3z"/>
  <path fill="url(#metal)" d="M133 203l29-42 58-12 40 32 15 58-25 55-48 29-49-29-27-52z"/>
  <path fill="#9db0a7" d="M133 203l29-42 38 27-2 39-48 7z"/>
  <path fill="#597678" d="M200 188l20-39 40 32 15 58-57-11z"/>
  <path fill="#d4c49d" d="M132 212l66 15 72-13 5 25-69 17-80-14z"/>
  <path fill="#182d35" d="M143 225l55 12 60-12-3 14-52 12-58-13z"/>
  <path fill="#8fc8b0" d="M151 229l33 7v4l-31-7zM217 237l33-7-1 4-32 7z"/>
  <path fill="#83978d" d="M126 242l72 18 4 63-49-29z"/>
  <path fill="#3b565e" d="M198 260l77-21-25 55-48 29z"/>
  <path fill="#c8a66a" d="M197 191l9-3 3 70-7 65-6-5 2-59z"/>
  <path d="M154 267l6 12M167 271l5 12M235 268l-5 14M247 264l-5 13" stroke="#223b43" stroke-width="3"/>
  <path fill="#152a31" stroke="#7e928a" stroke-width="3" d="M53 369l66-16 44 33-6 72-57 32-49-49z"/>
  <path fill="#28464a" d="M64 379l54-13 33 27-6 60-44 24-38-40z"/>
  <path fill="#c8a66a" d="M105 385l7 26 26 7-26 7-7 29-7-29-24-7 24-7z"/>
  <path fill="url(#metal)" d="M306 276l7-31 9 31-4 138h-10z"/>
  <path fill="#c8a66a" d="M293 401h41v8h-41zM308 414h11v36h-11z"/>
''', "#c8a66a", "#29363b")

card("assassin", '''
  <path fill="#2f2b48" d="M61 457l30-108 51-41h99l62 41 40 108z"/>
  <path fill="#57506f" d="M95 347l48-39 57 37-61 60-60-10zM202 345l39-37 62 41 20 50-58 12z"/>
  <path fill="#26283f" d="M143 350l56-5 67 60-27 55h-95l-23-57z"/>
  <path fill="#7b6684" d="M143 308l56 37-39 31-49-22zM202 345l39-37 37 27-39 43z"/>
  <path fill="#3e3655" d="M139 255l-4-68 29-55 48-19 49 41 17 81-33 76-48 24-51-26z"/>
  <path fill="#6f5b7c" d="M135 187l29-55 48-19-25 57-33 44z"/>
  <path fill="#51435f" d="M212 113l49 41 17 81-51-36-40-29z"/>
  <path fill="#171d2e" d="M154 214l33-44 40 29 27 40-26 54-34 14-39-37z"/>
  <path fill="#3f364f" d="M155 242l41 20 44-19-12 50-34 14-39-37z"/>
  <path fill="#8f758f" d="M154 214l33-44-13 46-21 27z"/>
  <path fill="#af9aae" d="M162 234l24 5 4 7-23-4zM211 239l27-9-6 10-23 8z"/>
  <path fill="#d8c8ba" d="M167 236l14 4-8 1zM218 238l15-5-7 6z"/>
  <path fill="#26263d" d="M155 268l39 39 34-14 12-28-34 17z"/>
  <path fill="#8c7391" d="M128 275l26 22 41 11-26 32-29-32zM236 294l31-34-11 61-34 34-25-21z"/>
  <path fill="#ae929e" d="M190 324l10-10 10 10-10 16z"/>
  <path d="M119 355l135 94M266 356L145 450" stroke="#171f2e" stroke-width="18"/>
  <path d="M119 355l135 94M266 356L145 450" stroke="#89705f" stroke-width="10"/>
  <path fill="#c8a66a" d="M176 384l17-18 12 9-17 18zM220 392l-13-10 12-12 13 10z"/>
  <path fill="#38404e" d="M84 382l34-3 27 47-32 23-32-25zM270 381l34 2 17 43-35 23-27-26z"/>
  <path fill="#8c7890" d="M84 382l34-3 12 21-48 11zM270 381l34 2 10 25-46-7z"/>
  <path fill="url(#metal)" d="M99 395l-37-93-1-52 34 40 24 99zM283 394l26-102 31-39v51l-38 97z"/>
  <path fill="#c4bfc3" d="M61 250l20 49 18 96 6-2-10-103zM340 253l-23 51-24 92 9 5 38-97z"/>
  <path fill="#c8a66a" d="M82 394l43-15 3 8-44 16zM270 380l46 15-3 8-46-15z"/>
  <path d="M38 339l38-20M324 354l36-23M74 176l23-16" stroke="#ac8ca0" stroke-opacity=".3"/>
''', "#b09bbe", "#2b293e")

card("troll", '''
  <path fill="#594b36" d="M293 148l42-15 13 13-4 74-40 36-24-35z"/>
  <path fill="#7e6b44" d="M293 148l42-15-9 63-22 60-24-35z"/>
  <path d="M303 158l-11 63M319 152l-9 74M284 210l54-17" stroke="#332e28" stroke-width="4"/>
  <path fill="#a3a088" d="M335 134l-8-20-9 17zM300 143l-11-15-3 22zM344 174l18-10-16 28zM302 247l-10 15 18-3z"/>
  <path d="M307 235l-50 190" stroke="#493f2d" stroke-width="21"/>
  <path d="M310 238l-49 186" stroke="#91734b" stroke-width="9"/>
  <path fill="#344e3b" d="M48 454l20-109 52-49 104-11 74 64 14 105z"/>
  <path fill="#6a8256" d="M68 345l52-49 53 21-25 99-91-9zM196 312l28-27 74 64 13 58-78 4z"/>
  <path fill="#456443" d="M148 416l25-99 23-5 37 99-16 47h-56z"/>
  <path fill="#a3ad76" d="M96 328l24-32 53 21-34 24zM196 312l28-27 49 42-45 16z"/>
  <path fill="#384634" d="M69 344l-12 63 50 10 8-73zM263 340l-14 79 61-12-12-58z"/>
  <path fill="#6b6650" d="M84 327l22-32 34 9-15 49-38 15-26-14z"/>
  <path fill="#c5be94" d="M83 326l-9-33 25 26zM110 309l12-31 8 30zM64 345l-23-9 15 27z"/>
  <path fill="#697f52" d="M123 194l22-44 53-16 45 22 23 51-12 81-54 46-63-41z"/>
  <path fill="#a3ac71" d="M123 194l22-44 53-16 1 69-45 32z"/>
  <path fill="#85945c" d="M199 134l44 22 23 51-47 23-20-27z"/>
  <path fill="#496644" d="M123 194l31 41 45-32 20 27 47-23-12 81-54 46-63-41z"/>
  <path fill="#81965f" d="M137 229l-38-19 12 51 29 8zM252 224l39-17-10 49-25 14z"/>
  <path fill="#c8bc8b" d="M141 173l-23-21-3-44 28 35 20 15zM224 154l26-15 22-36-2 47-27 28z"/>
  <path fill="#777d50" d="M149 209l29-8 7 17-38 7zM213 204l34 5 4 17-39-8z"/>
  <path fill="#24392e" d="M148 225l31-7-4 11-25 4zM217 220l29 6-2 9-26-5z"/>
  <path fill="#dcce85" d="M156 226l13-3-1 6-11 1zM222 225l13 3-2 4-10-3z"/>
  <path fill="#9ba76c" d="M191 215l-12 39 23 12 16-12-12-39z"/>
  <path fill="#344e36" d="M151 274l43-6 48 6-16 30-29 13-32-15z"/>
  <path fill="#d0c89e" d="M155 280l-8-32 21 28zM225 278l17-31-4 36z"/>
  <path fill="#9a9b6b" d="M182 283l29-1-3 9-23 1z"/>
  <path fill="#2d4939" d="M145 288l28 12 25 13 26-14 28-9-9 35-25 29-21 21-26-25-22-25z"/>
  <path fill="#56754c" d="M148 292l25 8 25 13-4 36-23-13-10-22zM224 299l28-9-9 35-25 29 5-32z"/>
  <path d="M100 393l165 35" stroke="#a58a55" stroke-width="17"/>
  <path fill="#cfb982" d="M173 400l24-4 9 29-27 4z"/>
  <path fill="#779261" d="M249 389l24-9 17 15-7 35-29 6-16-20z"/>
  <path fill="#b1b687" d="M277 384l14 8-2 8-12-5zM280 403l10 1-3 9-11-2z"/>
  <g fill="#84a46c"><path d="M150 151l2-22 14 17 11-14 1 19zM83 327l15-12 1 16 15-6-9 17-13 6zM220 160l10-17 4 14 13-6-4 13z"/></g>
''', "#a6b87d", "#303b2c")


hero = '''<defs>
  <linearGradient id="sky" x2="0" y2="1"><stop stop-color="#14242a"/><stop offset=".66" stop-color="#152126"/><stop offset="1" stop-color="#0b1116"/></linearGradient>
  <radialGradient id="glow"><stop stop-color="#c8a66a" stop-opacity=".2"/><stop offset=".55" stop-color="#c8a66a" stop-opacity=".06"/><stop offset="1" stop-color="#c8a66a" stop-opacity="0"/></radialGradient>
  <linearGradient id="path" x2=".2" y2="1"><stop stop-color="#b9a273" stop-opacity=".35"/><stop offset="1" stop-color="#8fc8b0" stop-opacity="0"/></linearGradient>
  <linearGradient id="stone" x2="1" y2=".3"><stop stop-color="#29403f"/><stop offset="1" stop-color="#15252c"/></linearGradient>
  <linearGradient id="vignette" x2="0" y2="1"><stop offset=".5" stop-color="#0b1116" stop-opacity="0"/><stop offset="1" stop-color="#0b1116" stop-opacity=".75"/></linearGradient>
</defs>
<path fill="url(#sky)" d="M0 0h1120v700H0z"/>
<ellipse cx="561" cy="238" rx="360" ry="300" fill="url(#glow)"/>
<g fill="#b9b69a" opacity=".5">
  <circle cx="181" cy="92" r="1"/><circle cx="938" cy="105" r="1.3"/><circle cx="320" cy="46" r="1"/><circle cx="717" cy="70" r="1"/><circle cx="852" cy="184" r="1.4"/><circle cx="282" cy="201" r="1.2"/><circle cx="76" cy="186" r=".8"/><circle cx="1045" cy="231" r=".8"/><circle cx="422" cy="104" r="1.3"/>
</g>
<path fill="none" stroke="#c8a66a" stroke-opacity=".12" d="M399 240a162 162 0 1 1 324 0M370 240h20M732 240h20M561 50v20"/>
<circle cx="561" cy="240" r="128" fill="#132027" stroke="#a28757" stroke-width="1"/>
<circle cx="561" cy="240" r="119" fill="none" stroke="#c8a66a" stroke-width="7"/>
<path d="M463 171a119 119 0 0 1 206 113" fill="none" stroke="#edd19a" stroke-width="2"/>
<path d="M462 306a119 119 0 0 0 171 30" fill="none" stroke="#c8a66a" stroke-opacity=".45" stroke-width="3"/>
<path fill="#c8a66a" d="M561 77l4 9-4 9-4-9zM721 240l7-3 7 3-7 3zM382 240l7-3 7 3-7 3z"/>
<path fill="#21343a" d="M0 300l127-81 118 114 91-71 111 130 91-45 112 12 121-90 105 50 115-91 129 85v387H0z"/>
<path fill="#2b3e40" d="M0 300l127-81 118 114-115-72zM336 262l111 130-80-53-47-7zM771 269l105 50 115-91-97 119z"/>
<path fill="#182c31" d="M0 391l127-48 143 88 155-31 126 59 127-57 126 24 157-94 159 50v318H0z"/>
<path fill="#1e3435" d="M0 389l127-46 143 88-140-39zM678 402l126 24 157-94-153 132z"/>
<path fill="#112127" d="M0 473l146-35 147 64 134-25 136 22 131-26 149 36 127-61 150 32v220H0z"/>
<path fill="url(#path)" d="M552 446h20l26 47-11 35 75 67 95 105H342l170-116 37-51-16-35z"/>
<path d="M561 461l8 46-7 28 45 56" stroke="#b4b68d" stroke-opacity=".22" stroke-width="2" fill="none"/>
<path fill="#0d1b22" d="M389 493l14-180 22-72 50-47 87-30 87 30 49 48 24 72 15 179h-57l-12-176-17-42-31-28-57-21-57 21-30 29-17 41-10 176z"/>
<path fill="url(#stone)" d="M402 491l14-175 21-67 43-43 82-28v39l-65 23-34 32-19 47-10 172zM562 178l80 28 43 43 22 68 15 174h-33l-12-172-18-47-34-32-63-23z"/>
<path fill="#3b4f46" d="M437 249l43-43 82-28v16l-72 25-44 42zM562 178l80 28 43 43-9 12-45-42-69-25z"/>
<path fill="#2d433f" d="M416 316l28 3-10 172h-32zM678 319l29-2 15 174h-33z"/>
<path d="M418 340l26 1M413 396l26 1M408 454l27 1M679 340h30M683 396h30M688 454h30M446 259l17 13M490 218l7 22M562 178v40M632 218l-7 22M677 260l-18 12" stroke="#0d2028" stroke-width="4"/>
<path fill="#c8a66a" d="M562 185l9 20-9 20-9-20z"/>
<path fill="#91b4a1" d="M415 347l6-7 5 7-6 9zM696 347l6-7 5 7-6 9z" opacity=".6"/>
<path d="M420 375v39M700 375v39" stroke="#9a9670" stroke-width="2" opacity=".5"/>
<path fill="#1a2c2e" d="M351 490l-3-50 26-6 15 39 18 18zM724 492l22-49 22 5-4 43zM289 520l18-37 33 5 15 31zM799 536l21-51 36 11 2 39z"/>
<path fill="#0b171e" d="M0 522l142-51 102 46-30 67-103 43L0 621zM1120 519l-135-45-91 50 32 53 99 60 95-13z"/>
<path fill="#263d36" d="M13 520l129-49 102 46-88-11-63 25zM985 474l-91 50 78-17 91 28z"/>
<g fill="#29493d"><path d="M54 491l18-56 16 42 20 9-26 16zM183 509l13-38 12 26 13 8-28 10zM1041 493l16-49 16 33 14 10-26 14zM933 509l13-35 11 25 11 7-21 10z"/></g>
<path fill="#122129" d="M0 640l145-39 118 55 111-24 176 68H0zM1120 636l-120-40-145 53-156-6-99 57h520z"/>
<path fill="url(#vignette)" d="M0 0h1120v700H0z"/>
<g fill="#c8a66a" opacity=".5"><path d="M330 376l2-4 2 4-2 4zM756 212l2-4 2 4-2 4zM793 438l2-5 2 5-2 5zM491 411l2-5 2 5-2 5z"/><circle cx="622" cy="396" r="1.2"/><circle cx="582" cy="368" r="1"/><circle cx="528" cy="465" r="1"/></g>
'''
(ROOT / "hero.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="700" viewBox="0 0 1120 700">' + hero + '</svg>')
print("Generated seven original SVG illustrations")
