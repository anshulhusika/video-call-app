import React, { useRef, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { Layout, Row, Col, Input, Button, Typography, Space } from 'antd';
import './App.css';

const { Header, Content } = Layout;
const { Title, Text } = Typography;

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
const [callActive, setCallActive] = useState(false);
const [fullscreenVideo, setFullscreenVideo] = useState('remote'); // or 'local'
const [dragOffset, setDragOffset] = useState({ x: 20, y: 20 });
const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    socket.on('connect', () => {
      setSocketId(socket.id);
      console.log("Connected with socket ID:", socket.id);
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
      console.error(err);
    }
  };

  const createPeerConnection = (remoteId) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
      ],
    });

    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => {
        pc.addTrack(track, mediaStream);
      });
    } else {
      console.warn("Media stream not available when creating PeerConnection");
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

    pc.onconnectionstatechange = () => {
      console.log("Peer connection state:", pc.connectionState);
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
  setCallActive(true);
};
const toggleFullscreen = (video) => {
  setFullscreenVideo(video);
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
  <Layout style={{ height: '100vh', backgroundColor: '#000' }}>
    <Content style={{ position: 'relative', overflow: 'hidden' }}>
    <video
  ref={remoteVideo}
  autoPlay
  playsInline
  className={`remote-video ${fullscreenVideo === 'remote' ? 'fullscreen-remote' : 'mini-video'}`}
  style={fullscreenVideo === 'remote' ? {} : {
    top: `${dragOffset.y}px`,
    left: `${dragOffset.x}px`,
    cursor: 'grab'
  }}
  onClick={() => toggleFullscreen('remote')}
  onMouseDown={(e) => {
    if (fullscreenVideo === 'local') return;
    setIsDragging(true);
    const offsetX = e.clientX - dragOffset.x;
    const offsetY = e.clientY - dragOffset.y;
    const onMouseMove = (moveEvent) => {
      if (!isDragging) return;
      setDragOffset({
        x: moveEvent.clientX - offsetX,
        y: moveEvent.clientY - offsetY,
      });
    };
    const onMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }}
/>

<video
  ref={localVideo}
  autoPlay
  muted
  playsInline
  className={`local-video ${fullscreenVideo === 'local' ? 'fullscreen-local' : 'mini-video'}`}
  style={fullscreenVideo === 'local' ? {} : {
    bottom: '20px',
    right: '20px'
  }}
  onClick={() => toggleFullscreen('local')}
/>

<div className={`controls ${callActive ? 'hidden-controls' : ''}`}>
  <Title level={4} style={{ color: '#00b96b', margin: 0 }}>Connect Video</Title>
  <Text style={{ color: '#fff' }}>Your ID: <strong>{socketId}</strong></Text>

  <Space direction="vertical" size="middle" style={{ marginTop: 10, width: '100%' }}>
    <Input
      placeholder="Enter ID to call"
      value={targetId}
      onChange={(e) => setTargetId(e.target.value)}
    />
    <div>
      <Button type="primary" onClick={() => callUser()}>Call</Button>
      {!streamStarted && (
        <Button onClick={startLocalStream}>Enable Camera</Button>
      )}
      <Button onClick={collectAndSendUserInfo}>Send Location</Button>
    </div>
    <div>
      <Text style={{ color: '#fff' }} strong>People Online:</Text>
      <Space wrap>
        {onlineUsers.length === 0 ? (
          <Text type="secondary">No one else online</Text>
        ) : (
          onlineUsers.map(id => (
            <Button size="small" key={id} onClick={() => callUser(id)}>{id}</Button>
          ))
        )}
      </Space>
    </div>
  </Space>
</div>

    </Content>
  </Layout>
);

};

export default App;
