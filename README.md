## Online Minesweeper Duel


### Overview

Online Minesweeper Duel is a multiplayer web-based Minesweeper game where you compete with up to 7 players to uncover the most mines.
Unlike traditional Minesweeper, victory goes to the player who finds the most mines. Both turn-based and real-time game modes are supported, and various options allow you to adjust the game difficulty for each mode.

[Online Demo](https://mine.meetat.org/)
<img width="997" height="769" alt="image" src="https://github.com/user-attachments/assets/aa7d090a-402f-4288-bda4-31a82748ec74" />


### Key Features

- Multiplayer: Play with up to 7 opponents online
- Flexible Game Modes: Enjoy both turn-based and real-time play
- Customizable Difficulty: Fine-tune game options to match your preferred challenge level
- Modern Web Tech: Lightweight implementation using JavaScript and WebSockets


### Project Background

This project was 100% developed by AI (GPT)—from architecture and logic to actual code.
No human coding, design, or code review was performed during initial development.
Critical errors and abnormal behaviors have been checked and patched, but the overall code is a direct result of fully automated AI coding.

Note: The code is provided purely for demonstration purposes, and should not be used as a reference for best practices, code organization, or educational material.


### Quick Start
Clone the repository

Run node server/server.js

Open http://localhost:3000 in your browser
(or use the online demo link above)


### Project Structure

**Server**

server/server.js:
Main entry point for backend logic, including static file serving and WebSocket handlers.

server/game.js:
Functions and logic related to individual game instances.

Server-side Note:
Some game logic is distributed between server.js, WebSocket handlers, and game.js.
For better maintainability, it is recommended to isolate game instance management in game.js and reserve server.js for service entry points. Further refactoring and separation (e.g., moving internal logic to gameLogics.js) will improve cohesion.


***Client***

public/index.html:
Main UI structure.

public/style.css:
UI styling.

public/main.js:
Client-side dynamic logic and HTML event handling.

public/ui.js:
Modular functions for UI element updates.

Client-side Note:
Current code structure lacks clear separation of concerns—game instance logic and variables are fragmented across files, especially main.js.
Further improvements could include better instance management, dedicated server communication managers, and more organized UI update modules.


### Future Improvements

Improve code cohesion and modularity, both server- and client-side

Refactor game instance management and UI update handling

Enhance documentation and developer onboarding experience

### License

This project is open-source and welcomes feedback, refactoring, and community-driven improvements.
