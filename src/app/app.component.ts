import {
  Component,
  ElementRef,
  OnInit,
  ViewChild
} from '@angular/core';

import { WebSocketService } from './websocket.service';

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {

  @ViewChild('localVideo')
  localVideo!: ElementRef<HTMLVideoElement>;

  @ViewChild('remoteVideo')
  remoteVideo!: ElementRef<HTMLVideoElement>;

  message = 'Click Start Chat to begin';

  isConnected = false;

  private localStream!: MediaStream;

  private peerConnection!: RTCPeerConnection;

  private roomId!: string;

  private isInitiator = false;

  constructor(
    private webSocketService: WebSocketService
  ) {}

  ngOnInit(): void {

    this.webSocketService.onMessage =
      (message: any) => this.handleWebSocketMessage(message);

  }

  async startChat(): Promise<void> {

    try {

      // Get camera and microphone
      this.localStream =
        await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });

      // Show local video
      this.localVideo.nativeElement.srcObject =
        this.localStream;

      this.message =
        'Camera connected. Finding a random user...';

      // Connect WebSocket
      this.webSocketService.connect();

      this.isConnected = true;

    } catch (error) {

      console.error(
        'Camera/Microphone error:',
        error
      );

      this.message =
        'Camera or microphone permission denied.';
    }
  }

  private async handleWebSocketMessage(
    message: any
  ): Promise<void> {

    console.log('Received:', message);

    // Waiting
    if (message.type === 'WAITING') {

      this.message =
        'Waiting for a random user...';

      return;
    }

    // Match found
    if (message.type === 'MATCH_FOUND') {

      this.roomId = message.roomId;

      this.isInitiator = message.initiator;

      this.message =
        'Stranger found! Connecting...';

      await this.createPeerConnection();

      // First user creates offer
      if (this.isInitiator) {

        await this.createOffer();

      }

      return;
    }

    // Offer received
    if (message.type === 'OFFER') {

      await this.handleOffer(message);

      return;
    }

    // Answer received
    if (message.type === 'ANSWER') {

      await this.handleAnswer(message);

      return;
    }

    // ICE candidate received
    if (message.type === 'ICE_CANDIDATE') {

      await this.handleIceCandidate(message);

      return;
    }

    // Peer disconnected
    if (message.type === 'PEER_DISCONNECTED') {

      this.message =
        'Stranger disconnected.';

    }
  }

  private async createPeerConnection(): Promise<void> {

    this.peerConnection =
      new RTCPeerConnection({

        iceServers: [
          {
            urls:
              'stun:stun.l.google.com:19302'
          }
        ]

      });

    // Add local camera + microphone
    this.localStream
      .getTracks()
      .forEach(track => {

        this.peerConnection.addTrack(
          track,
          this.localStream
        );

      });

    // Receive remote stream
    this.peerConnection.ontrack =
      (event) => {

        console.log(
          'Remote stream received'
        );

        this.remoteVideo
          .nativeElement
          .srcObject = event.streams[0];

        this.message =
          'Connected! You are now talking to a stranger.';
      };

    // ICE candidates
    this.peerConnection.onicecandidate =
      (event) => {

        if (event.candidate) {

          this.webSocketService.send({

            type: 'ICE_CANDIDATE',

            roomId: this.roomId,

            candidate: event.candidate

          });

        }

      };

    this.peerConnection.onconnectionstatechange =
      () => {

        console.log(
          'WebRTC state:',
          this.peerConnection.connectionState
        );

      };
  }

  private async createOffer(): Promise<void> {

    const offer =
      await this.peerConnection.createOffer();

    await this.peerConnection
      .setLocalDescription(offer);

    this.webSocketService.send({

      type: 'OFFER',

      roomId: this.roomId,

      offer: offer

    });

    console.log('Offer sent');
  }

  private async handleOffer(
    message: any
  ): Promise<void> {

    await this.peerConnection
      .setRemoteDescription(
        message.offer
      );

    const answer =
      await this.peerConnection
        .createAnswer();

    await this.peerConnection
      .setLocalDescription(answer);

    this.webSocketService.send({

      type: 'ANSWER',

      roomId: this.roomId,

      answer: answer

    });

    console.log('Answer sent');
  }

  private async handleAnswer(
    message: any
  ): Promise<void> {

    await this.peerConnection
      .setRemoteDescription(
        message.answer
      );

    console.log('Answer received');
  }

  private async handleIceCandidate(
    message: any
  ): Promise<void> {

    try {

      await this.peerConnection
        .addIceCandidate(
          message.candidate
        );

    } catch (error) {

      console.error(
        'ICE candidate error:',
        error
      );

    }
  }
}