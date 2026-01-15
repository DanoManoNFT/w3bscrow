# Pokemonini

A tiny, offline, single-screen 1v1 Pokémon-style battle built in plain HTML/CSS/JS.

## How to Run

- Open `index.html` in a modern desktop browser.
- If your browser blocks local assets, run a simple local server:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Project Structure

```
index.html
main.js
style.css
```

## Gameplay Notes

- Choose **FIGHT** to use moves or **BAG** to use potions.
- Each side starts with 1 Super Potion (+50 HP) and 1 Potion (+10 HP).
- The battle ends when a Pokémon reaches 0 HP.
