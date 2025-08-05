## Online Minesweeper Duel

### Overview
This is an online multiplayer Minesweeper game where you compete against up to 7 other players to find as many mines as possible.
Unlike classic Minesweeper, the winner is the player who uncovers the most mines.

Both turn-based and real-time modes are supported, and you can adjust game difficulty through various mode-specific options.

### Notice
This codebase was created entirely using GPT.
While all critical errors and abnormal behaviors have been carefully reviewed and corrected, the code is written solely for functional purposes.
It is not recommended for use as an educational resource or for learning development best practices.

### Demo
https://mine.meetat.org/

<img width="997" height="769" alt="image" src="https://github.com/user-attachments/assets/aa7d090a-402f-4288-bda4-31a82748ec74" />


## Project Structure

### Server

***server/server.js***
Main entry point for backend logic.
Handles static file serving for the frontend as well as WebSocket handlers.

***server/game.js***
Contains functions related to individual game instances.

**Server Code Notes**
Many game-related functions are currently implemented directly in server.js.
Core game logic is split between WebSocket handlers, functions within server.js, and game.js.
Ideally, server.js should only handle service-related logic, while game.js focuses on game instance management and state handling. Internal game logic could be further encapsulated in a separate gameLogics.js file for better cohesion.

### Client

***public/index.html***
Contains all HTML elements needed for the UI.

***public/style.css***
CSS styles for the UI layout and appearance.

***public/main.js***
Contains runtime logic for dynamically handling HTML elements.

***public/ui.js***
Contains modular code for updating specific HTML elements during runtime.

**Client Code Notes**
Similar to the server, the client code currently has significant cohesion and code organization issues.
Game instance management is not well separated conceptually, and related variables are handled in a fragmented way within main.js.
Ideally, main.js should only be responsible for client initialization and high-level instance management.
A separate manager for server communication, clearer object-oriented structure for each game instance, and improved separation of UI update logic into dedicated files are all recommended improvements.
