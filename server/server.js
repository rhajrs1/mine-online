import express from "express";
import http from "http";
import { Server } from "socket.io";
import { RoomManager } from "./roomManager.js";

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static("public"));

const rm = new RoomManager(io);

io.on("connection", socket => {

  socket.on("room:create", (payload = {}) => {
    rm.createRoom(socket, payload);
  });

  // 옵션 변경 (방장만)
  socket.on("option:update", (opt) => {
    rm.optionUpdate(socket, opt);
  });

  socket.on("room:join", ({ roomId, name = "P2" }) => {
    rm.joinRoom(socket, { roomId, name });
  });

  socket.on("game:start", (opts = {}) => {
    rm.startGame(socket, opts);
  });

  socket.on("game:stop", () => {
    rm.stopGame(socket);
  });

  socket.on("tile:reveal", ({ x, y }) => {
    rm.reveal(socket, { x, y });
  });

  socket.on("disconnect", () => {
    rm.onDisconnect(socket);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("listening on", PORT));
