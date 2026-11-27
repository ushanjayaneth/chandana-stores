import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource/noto-sans-sinhala/sinhala-400.css';
import '@fontsource/noto-sans-sinhala/sinhala-600.css';
import {LanguageProvider} from './lib/language';
import App from './App';
import './styles/base.css';
import './styles/pos.css';
import './styles/management.css';
import './styles/responsive.css';
import './styles/retail.css';

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><LanguageProvider><App/></LanguageProvider></React.StrictMode>);
