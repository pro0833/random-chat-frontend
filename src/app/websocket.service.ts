import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class WebSocketService {

  private socket!: WebSocket;

  onMessage: ((message: any) => void) | null = null;

  connect(): void {

    const protocol =
      window.location.protocol === 'https:'
        ? 'wss:'
        : 'ws:';

    const host = window.location.host;

    this.socket = new WebSocket(
      `${protocol}//${host}/ws`
    );

    this.socket.onopen = () => {
      console.log('WebSocket connected');
    };

    this.socket.onmessage = (event) => {

      const message = JSON.parse(event.data);

      console.log('WebSocket message:', message);

      if (this.onMessage) {
        this.onMessage(message);
      }
    };

    this.socket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    this.socket.onclose = () => {
      console.log('WebSocket disconnected');
    };
  }

  send(message: any): void {

    if (this.socket?.readyState === WebSocket.OPEN) {

      this.socket.send(
        JSON.stringify(message)
      );

    } else {

      console.error('WebSocket is not connected');
    }
  }

  disconnect(): void {

    if (this.socket) {
      this.socket.close();
    }
  }
}