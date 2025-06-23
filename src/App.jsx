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
          className="remote-video"
        />
        <video
          ref={localVideo}
          autoPlay
          muted
          playsInline
          className="local-video"
        />
        <div className="controls">
          <Space direction="vertical" style={{ width: '100%' }} align="center">
            <Text style={{ color: '#fff' }}>Your ID: {socketId}</Text>
            <Input
              placeholder="Enter ID to call"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              style={{ width: '80%' }}
            />
            <Space>
              <Button type="primary" onClick={() => callUser()}>Call</Button>
              {!streamStarted && (
                <Button onClick={startLocalStream}>Enable Camera</Button>
              )}
              <Button onClick={collectAndSendUserInfo}>Send Location</Button>
            </Space>
            <Row justify="center" style={{ color: '#fff', marginTop: 10 }}>
              <Col>
                <Text strong>People Online:</Text>
                <Space>
                  {onlineUsers.length === 0
                    ? <Text>No one else online</Text>
                    : onlineUsers.map(id => (
                      <Button key={id} onClick={() => callUser(id)}>{id}</Button>
                    ))}
                </Space>
              </Col>
            </Row>
          </Space>
        </div>
      </Content>
    </Layout>
  );
};

export default App;
