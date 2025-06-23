import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Bootstrap CSS (already done in your App.js or global styles)
import 'bootstrap/dist/css/bootstrap.min.css';
// Bootstrap JS for collapse, dropdowns, modals, etc.
import 'bootstrap/dist/js/bootstrap.bundle.min.js';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
