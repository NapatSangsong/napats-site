# napats-site

Personal portfolio website for Napat Sangsong — a full-stack developer at Thalamo, built with React Router 7 and deployed on Cloudflare Workers.

## Tech Stack

- **Framework:** React Router 7 (SSR)
- **Styling:** Tailwind CSS 4
- **Runtime:** Cloudflare Workers
- **Language:** TypeScript
- **Build:** Vite

## Getting Started

### Install dependencies

```bash
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

### Build

```bash
npm run build
```

### Deploy

```bash
npm run deploy
```

## Project Structure

```
app/
  routes/
    home.tsx      # Landing page
  root.tsx        # Root layout
  app.css         # Global styles
public/
  favicon.svg
```

## Site Sections

- **Hero** — Introduction with animated marquee
- **About** — Background and philosophy
- **Skills** — Technical expertise (Frontend, Backend, Database & DevOps)
- **Beyond Code** — Personal interests (Music, Literature, Coffee Roasting, Thuaifu)
- **Contact** — Email, phone, and address
