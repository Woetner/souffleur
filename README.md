# Souffleur

Repeteer je toneelrol met AI-tegenspelers. Upload je script (Word of PDF), kies je rol, en de app speelt alle andere rollen met eigen stemmen. Spreek je tekst hardop: de app luistert en geeft je de volgende cue. Tikken kan ook.

## Hoe het werkt

- **Script inlezen** gebeurt op je eigen telefoon, zonder AI. Het script verlaat je toestel niet (alleen de losse zinnen van tegenspelers gaan naar Google om ingesproken te worden).
- **Stemmen**: Google Gemini TTS met je eigen gratis sleutel uit [Google AI Studio](https://aistudio.google.com/apikey). Elke zin wordt één keer ingesproken en daarna op je toestel bewaard, dus oefenen kost niets. Zonder sleutel gebruikt de app de gratis (robot)stem van je browser.
- **Luisteren** naar je eigen tekst gebeurt met de spraakherkenning van je browser (Chrome, Edge, Safari). Tikken werkt altijd als reserve.
- Alles wordt lokaal opgeslagen (IndexedDB). Er zijn geen accounts.

## Ontwikkelen

```bash
npm install
npm run dev
npm run build
```

Elke push naar `main` wordt via GitHub Actions gepubliceerd op GitHub Pages.
