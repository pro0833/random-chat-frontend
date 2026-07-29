import { Injectable } from '@angular/core';

export type WebSocketConnectionState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'CLOSING';

@Injectable({
  providedIn: 'root'
})
export class WebSocketService {

  private socket: WebSocket | null = null;

  private connectionState:
    WebSocketConnectionState = 'DISCONNECTED';

  onMessage: ((message: any) => void) | null = null;

  onStateChange:
    ((state: WebSocketConnectionState) => void) | null = null;


  // ============================================================
  // CONNECT
  // ============================================================

  connect(): void {

    /*
     * Prevent duplicate WebSocket connections.
     */
    if (
      this.socket &&
      (
        this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING
      )
    ) {
      console.log('WebSocket already connected/connecting');
      return;
    }

    this.setState('CONNECTING');

    const protocol =
      window.location.protocol === 'https:'
        ? 'wss:'
        : 'ws:';

    const host = window.location.host;

    const url =
      `${protocol}//${host}/ws`;

    console.log('Connecting WebSocket:', url);

    const socket =
      new WebSocket(url);

    this.socket = socket;


    // ============================================================
    // OPEN
    // ============================================================

    socket.onopen = () => {

      /*
       * Ignore events from an old socket.
       */
      if (this.socket !== socket) {
        return;
      }

      console.log('WebSocket connected');

      this.setState('CONNECTED');
    };


    // ============================================================
    // MESSAGE
    // ============================================================

    socket.onmessage = (event) => {

      if (this.socket !== socket) {
        return;
      }

      try {

        const message =
          JSON.parse(event.data);

        console.log(
          'WebSocket message:',
          message
        );

        if (this.onMessage) {
          this.onMessage(message);
        }

      } catch (error) {

        console.error(
          'Invalid WebSocket message:',
          error
        );
      }
    };


    // ============================================================
    // ERROR
    // ============================================================

    socket.onerror = (error) => {

      if (this.socket !== socket) {
        return;
      }

      console.error(
        'WebSocket error:',
        error
      );
    };


    // ============================================================
    // CLOSE
    // ============================================================

    socket.onclose = (event) => {

      if (this.socket !== socket) {
        return;
      }

      console.log(
        'WebSocket disconnected.',
        'code:',
        event.code,
        'reason:',
        event.reason
      );

      this.socket = null;

      this.setState('DISCONNECTED');
    };
  }


  // ============================================================
  // SEND
  // ============================================================

  send(message: any): boolean {

    if (
      !this.socket ||
      this.socket.readyState !== WebSocket.OPEN
    ) {

      console.warn(
        'Cannot send message. WebSocket is not connected.'
      );

      return false;
    }

    try {

      this.socket.send(
        JSON.stringify(message)
      );

      return true;

    } catch (error) {

      console.error(
        'Failed to send WebSocket message:',
        error
      );

      return false;
    }
  }


  // ============================================================
  // DISCONNECT
  // ============================================================

  disconnect(): void {

    if (!this.socket) {

      this.setState('DISCONNECTED');

      return;
    }

    console.log(
      'Closing WebSocket...'
    );

    this.setState('CLOSING');

    this.socket.close();

    this.socket = null;

    this.setState('DISCONNECTED');
  }


  // ============================================================
  // STATE
  // ============================================================

  getState(): WebSocketConnectionState {

    return this.connectionState;
  }


  isConnected(): boolean {

    return (
      this.socket?.readyState ===
      WebSocket.OPEN
    );
  }


  // ============================================================
  // PRIVATE STATE HANDLER
  // ============================================================

  private setState(
    state: WebSocketConnectionState
  ): void {

    this.connectionState = state;

    if (this.onStateChange) {
      this.onStateChange(state);
    }
  }
}