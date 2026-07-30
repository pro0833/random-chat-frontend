import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild
} from '@angular/core';

import { CommonModule } from '@angular/common';

import {
  WebSocketConnectionState,
  WebSocketService
} from './websocket.service';

type ChatState =
  | 'IDLE'
  | 'REQUESTING_MEDIA'
  | 'CONNECTING'
  | 'WAITING'
  | 'MATCHED'
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'ENDED';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent
  implements AfterViewInit, OnDestroy {

  @ViewChild('localVideo')
  localVideo!: ElementRef<HTMLVideoElement>;

  @ViewChild('remoteVideo')
  remoteVideo!: ElementRef<HTMLVideoElement>;


  // ============================================================
  // CHAT STATE
  // ============================================================

  chatState: ChatState = 'IDLE';

  message = 'Ready to meet someone new.';

  isConnected = false;

  roomId: string | null = null;

  isInitiator = false;


  // ============================================================
  // MEDIA STATE
  // ============================================================

  localStream: MediaStream | null = null;

  isMicEnabled = true;

  isCameraEnabled = true;


  // ============================================================
  // WEBRTC
  // ============================================================

  peerConnection: RTCPeerConnection | null = null;

  private pendingIceCandidates: RTCIceCandidateInit[] = [];

  private remoteDescriptionSet = false;


  // ============================================================
  // CONSTRUCTOR
  // ============================================================

  constructor(
    private webSocketService: WebSocketService
  ) {

    this.webSocketService.onMessage =
      (message) => {

        void this.handleWebSocketMessage(message);
      };


    this.webSocketService.onStateChange =
      (state) => {

        this.handleWebSocketState(state);
      };
  }


  // ============================================================
  // AFTER VIEW INIT
  // ============================================================

  ngAfterViewInit(): void {

    console.log(
      'Random Chat application initialized.'
    );
  }


  // ============================================================
  // START CHAT
  // ============================================================

  async startChat(): Promise<void> {

    if (
      this.chatState !== 'IDLE' &&
      this.chatState !== 'ENDED' &&
      this.chatState !== 'DISCONNECTED'
    ) {
      return;
    }

    this.chatState =
      'REQUESTING_MEDIA';

    this.message =
      'Requesting camera and microphone access...';


    try {

      await this.initializeLocalMedia();

      this.message =
        'Camera connected. Finding a random user...';


      /*
       * Connect WebSocket.
       */
      this.chatState =
        'CONNECTING';

      this.webSocketService.connect();

    } catch (error) {

      console.error(
        'Camera/Microphone error:',
        error
      );

      this.chatState =
        'IDLE';

      this.message =
        'Camera or microphone permission is required to start chat.';
    }
  }


  // ============================================================
  // INITIALIZE LOCAL MEDIA
  // ============================================================

  private async initializeLocalMedia(): Promise<void> {

    /*
     * Stop any previous stream first.
     */
    this.stopLocalMedia();


    this.localStream =
      await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });


    if (this.localVideo) {

      this.localVideo
        .nativeElement
        .srcObject = this.localStream;
    }


    this.isMicEnabled = true;

    this.isCameraEnabled = true;
  }


  // ============================================================
  // WEBSOCKET STATE
  // ============================================================

  private handleWebSocketState(
    state: WebSocketConnectionState
  ): void {

    console.log(
      'WebSocket state:',
      state
    );


    if (state === 'CONNECTING') {

      if (
        this.chatState ===
        'REQUESTING_MEDIA'
      ) {

        this.chatState =
          'CONNECTING';
      }

      return;
    }


    if (state === 'CONNECTED') {

      /*
       * Backend automatically places the user
       * into the matchmaking queue.
       */
      return;
    }


    if (state === 'DISCONNECTED') {

      /*
       * Ignore normal disconnect after user
       * intentionally ended the chat.
       */
      if (
        this.chatState ===
        'ENDED'
      ) {
        return;
      }


      /*
       * If the WebSocket unexpectedly closes
       * while chatting, clean up WebRTC.
       */
      if (
        this.chatState === 'CONNECTED' ||
        this.chatState === 'MATCHED' ||
        this.chatState === 'WAITING'
      ) {

        this.cleanupPeerConnection();

        this.roomId = null;

        this.chatState =
          'DISCONNECTED';

        this.message =
          'Connection lost. Please start again.';
      }
    }
  }


  // ============================================================
  // WEBSOCKET MESSAGE HANDLER
  // ============================================================

  private async handleWebSocketMessage(
    message: any
  ): Promise<void> {

    console.log(
      'Received:',
      message
    );


    if (!message?.type) {

      console.warn(
        'Received WebSocket message without type.'
      );

      return;
    }


    // ------------------------------------------------------------
    // WAITING
    // ------------------------------------------------------------

    if (
      message.type ===
      'WAITING'
    ) {

      this.cleanupPeerConnection();

      this.roomId = null;

      this.chatState =
        'WAITING';

      this.message =
        message.message ||
        'Waiting for a random user...';

      return;
    }


    // ------------------------------------------------------------
    // MATCH FOUND
    // ------------------------------------------------------------

    if (
      message.type ===
      'MATCH_FOUND'
    ) {

      this.roomId =
        message.roomId;

      this.isInitiator =
        message.initiator === true;

      this.chatState =
        'MATCHED';

      this.message =
        'Stranger found! Connecting...';


      try {

        await this.createPeerConnection();


        /*
         * First user creates WebRTC offer.
         */
        if (this.isInitiator) {

          await this.createOffer();
        }

      } catch (error) {

        console.error(
          'Failed to establish WebRTC connection:',
          error
        );

        this.message =
          'Unable to establish video connection.';

        this.chatState =
          'DISCONNECTED';
      }

      return;
    }


    // ------------------------------------------------------------
    // OFFER
    // ------------------------------------------------------------

    if (
      message.type ===
      'OFFER'
    ) {

      await this.handleOffer(message);

      return;
    }


    // ------------------------------------------------------------
    // ANSWER
    // ------------------------------------------------------------

    if (
      message.type ===
      'ANSWER'
    ) {

      await this.handleAnswer(message);

      return;
    }


    // ------------------------------------------------------------
    // ICE CANDIDATE
    // ------------------------------------------------------------

    if (
      message.type ===
      'ICE_CANDIDATE'
    ) {

      await this.handleIceCandidate(message);

      return;
    }


    // ------------------------------------------------------------
    // PEER DISCONNECTED
    // ------------------------------------------------------------

    if (
      message.type ===
      'PEER_DISCONNECTED'
    ) {

      await this.handlePeerDisconnected();

      return;
    }


    // ------------------------------------------------------------
    // ERROR
    // ------------------------------------------------------------

    if (
      message.type ===
      'ERROR'
    ) {

      console.error(
        'Server error:',
        message.message
      );

      this.message =
        message.message ||
        'Something went wrong.';

      return;
    }
  }


  // ============================================================
  // CREATE PEER CONNECTION
  // ============================================================

  private async createPeerConnection(): Promise<void> {

    /*
     * Clean up previous connection.
     */
    this.cleanupPeerConnection();


    this.pendingIceCandidates = [];

    this.remoteDescriptionSet = false;


    this.peerConnection =
      new RTCPeerConnection({

        iceServers: [
          {
            urls:
              'stun:stun.l.google.com:19302'
          }
        ]

      });


    // ------------------------------------------------------------
    // ADD LOCAL TRACKS
    // ------------------------------------------------------------

    if (!this.localStream) {

      throw new Error(
        'Local media stream is not available.'
      );
    }


    this.localStream
      .getTracks()
      .forEach(
        (track) => {

          this.peerConnection!
            .addTrack(
              track,
              this.localStream!
            );
        }
      );


    // ------------------------------------------------------------
    // REMOTE TRACK
    // ------------------------------------------------------------

    this.peerConnection.ontrack =
      (event) => {

        console.log(
          'Remote stream received.'
        );


        if (
          this.remoteVideo &&
          event.streams?.[0]
        ) {

          this.remoteVideo
            .nativeElement
            .srcObject =
              event.streams[0];
        }


        this.chatState =
          'CONNECTED';

        this.message =
          'Connected! You are now talking to a stranger.';
      };


    // ------------------------------------------------------------
    // ICE CANDIDATE
    // ------------------------------------------------------------

    this.peerConnection.onicecandidate =
      (event) => {

        if (
          !event.candidate ||
          !this.roomId
        ) {
          return;
        }


        this.webSocketService.send({

          type:
            'ICE_CANDIDATE',

          roomId:
            this.roomId,

          candidate:
            event.candidate
        });
      };


    // ------------------------------------------------------------
    // CONNECTION STATE
    // ------------------------------------------------------------

    this.peerConnection
      .onconnectionstatechange =
      () => {

        if (!this.peerConnection) {
          return;
        }


        const state =
          this.peerConnection
            .connectionState;


        console.log(
          'WebRTC connection state:',
          state
        );


        if (
          state ===
          'connected'
        ) {

          this.chatState =
            'CONNECTED';

          this.message =
            'Connected! You are now talking to a stranger.';

          return;
        }


        if (
          state ===
          'connecting'
        ) {

          this.chatState =
            'MATCHED';

          this.message =
            'Connecting to stranger...';

          return;
        }


        if (
          state ===
          'disconnected'
        ) {

          this.message =
            'Connection interrupted...';

          return;
        }


        if (
          state ===
          'failed'
        ) {

          console.warn(
            'WebRTC connection failed.'
          );

          this.message =
            'Video connection failed. Try Next.';

          return;
        }


        if (
          state ===
          'closed'
        ) {

          console.log(
            'WebRTC connection closed.'
          );
        }
      };
  }


  // ============================================================
  // CREATE OFFER
  // ============================================================

  private async createOffer(): Promise<void> {

    if (!this.peerConnection) {
      return;
    }


    if (!this.roomId) {
      return;
    }


    const offer =
      await this.peerConnection
        .createOffer();


    await this.peerConnection
      .setLocalDescription(
        offer
      );


    this.webSocketService.send({

      type:
        'OFFER',

      roomId:
        this.roomId,

      offer:
        offer
    });


    console.log(
      'WebRTC offer sent.'
    );
  }


  // ============================================================
  // HANDLE OFFER
  // ============================================================

  private async handleOffer(
    message: any
  ): Promise<void> {

    if (!this.peerConnection) {

      console.warn(
        'Peer connection not ready for offer.'
      );

      return;
    }


    await this.peerConnection
      .setRemoteDescription(
        message.offer
      );


    this.remoteDescriptionSet =
      true;


    /*
     * Process any ICE candidates that arrived
     * before remote description.
     */
    await this.flushPendingIceCandidates();


    const answer =
      await this.peerConnection
        .createAnswer();


    await this.peerConnection
      .setLocalDescription(
        answer
      );


    if (!this.roomId) {
      return;
    }


    this.webSocketService.send({

      type:
        'ANSWER',

      roomId:
        this.roomId,

      answer:
        answer
    });


    console.log(
      'WebRTC answer sent.'
    );
  }


  // ============================================================
  // HANDLE ANSWER
  // ============================================================

  private async handleAnswer(
    message: any
  ): Promise<void> {

    if (!this.peerConnection) {
      return;
    }


    await this.peerConnection
      .setRemoteDescription(
        message.answer
      );


    this.remoteDescriptionSet =
      true;


    await this.flushPendingIceCandidates();


    console.log(
      'WebRTC answer received.'
    );
  }


  // ============================================================
  // HANDLE ICE CANDIDATE
  // ============================================================

  private async handleIceCandidate(
    message: any
  ): Promise<void> {

    if (
      !message.candidate
    ) {
      return;
    }


    /*
     * ICE candidates can arrive before
     * remote description is available.
     */
    if (
      !this.peerConnection ||
      !this.remoteDescriptionSet
    ) {

      this.pendingIceCandidates
        .push(
          message.candidate
        );

      return;
    }


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


  // ============================================================
  // FLUSH ICE CANDIDATES
  // ============================================================

  private async flushPendingIceCandidates(): Promise<void> {

    if (
      !this.peerConnection
    ) {
      return;
    }


    if (
      !this.remoteDescriptionSet
    ) {
      return;
    }


    const candidates =
      [...this.pendingIceCandidates];


    this.pendingIceCandidates = [];


    for (
      const candidate of candidates
    ) {

      try {

        await this.peerConnection
          .addIceCandidate(
            candidate
          );

      } catch (error) {

        console.error(
          'Failed to add queued ICE candidate:',
          error
        );
      }
    }
  }


  // ============================================================
  // NEXT
  // ============================================================

  nextChat(): void {

    if (
      this.chatState ===
      'IDLE'
    ) {
      return;
    }


    console.log(
      'User requested NEXT.'
    );


    /*
     * Immediately clean local WebRTC.
     */
    this.cleanupPeerConnection();


    this.clearRemoteVideo();


    this.roomId = null;


    this.chatState =
      'WAITING';

    this.message =
      'Finding a new random user...';


    /*
     * Backend handles:
     * room cleanup
     * peer notification
     * rematching
     */
    this.webSocketService.send({

      type:
        'NEXT'
    });
  }


  // ============================================================
  // END CHAT
  // ============================================================

  endChat(): void {

    console.log(
      'User ended chat.'
    );


    this.cleanupPeerConnection();


    this.stopLocalMedia();


    this.clearRemoteVideo();


    this.roomId = null;

    this.isInitiator = false;


    this.webSocketService.disconnect();


    this.chatState =
      'ENDED';

    this.isConnected =
      false;

    this.message =
      'Chat ended. Start again when you are ready.';
  }


  // ============================================================
  // MICROPHONE
  // ============================================================

  toggleMicrophone(): void {

    if (!this.localStream) {
      return;
    }


    const audioTracks =
      this.localStream
        .getAudioTracks();


    if (
      audioTracks.length === 0
    ) {
      return;
    }


    this.isMicEnabled =
      !this.isMicEnabled;


    audioTracks.forEach(
      (track) => {

        track.enabled =
          this.isMicEnabled;
      }
    );


    console.log(
      'Microphone:',
      this.isMicEnabled
        ? 'ON'
        : 'OFF'
    );
  }


  // ============================================================
  // CAMERA
  // ============================================================

  toggleCamera(): void {

    if (!this.localStream) {
      return;
    }


    const videoTracks =
      this.localStream
        .getVideoTracks();


    if (
      videoTracks.length === 0
    ) {
      return;
    }


    this.isCameraEnabled =
      !this.isCameraEnabled;


    videoTracks.forEach(
      (track) => {

        track.enabled =
          this.isCameraEnabled;
      }
    );


    console.log(
      'Camera:',
      this.isCameraEnabled
        ? 'ON'
        : 'OFF'
    );
  }


  // ============================================================
  // PEER DISCONNECTED
  // ============================================================

  private async handlePeerDisconnected(): Promise<void> {

    console.log(
      'Peer disconnected.'
    );


    this.cleanupPeerConnection();


    this.clearRemoteVideo();


    this.roomId = null;

    this.isInitiator = false;


    /*
     * Backend automatically sends WAITING
     * after PEER_DISCONNECTED.
     */
    this.chatState =
      'WAITING';

    this.message =
      'Stranger left. Finding someone new...';
  }


  // ============================================================
  // WEBRTC CLEANUP
  // ============================================================

  private cleanupPeerConnection(): void {

    if (
      this.peerConnection
    ) {

      console.log(
        'Closing WebRTC peer connection.'
      );


      this.peerConnection.ontrack =
        null;

      this.peerConnection.onicecandidate =
        null;

      this.peerConnection.onconnectionstatechange =
        null;


      this.peerConnection
        .getSenders()
        .forEach(
          (sender) => {

            try {
              sender.replaceTrack(null);
            } catch {
              // Ignore cleanup errors.
            }
          }
        );


      this.peerConnection.close();

      this.peerConnection =
        null;
    }


    this.pendingIceCandidates = [];

    this.remoteDescriptionSet =
      false;
  }


  // ============================================================
  // LOCAL MEDIA CLEANUP
  // ============================================================

  private stopLocalMedia(): void {

    if (!this.localStream) {
      return;
    }


    this.localStream
      .getTracks()
      .forEach(
        (track) => {

          track.stop();
        }
      );


    this.localStream = null;


    if (this.localVideo) {

      this.localVideo
        .nativeElement
        .srcObject = null;
    }


    this.isMicEnabled =
      true;

    this.isCameraEnabled =
      true;
  }


  // ============================================================
  // REMOTE VIDEO CLEANUP
  // ============================================================

  private clearRemoteVideo(): void {

    if (!this.remoteVideo) {
      return;
    }


    this.remoteVideo
      .nativeElement
      .srcObject = null;
  }


  // ============================================================
  // COMPONENT DESTROY
  // ============================================================

  ngOnDestroy(): void {

    console.log(
      'Destroying Random Chat application.'
    );


    this.cleanupPeerConnection();


    this.stopLocalMedia();


    this.clearRemoteVideo();


    this.webSocketService.disconnect();
  }
}