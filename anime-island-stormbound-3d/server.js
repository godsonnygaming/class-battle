const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req,res)=>res.json({ok:true}));
app.listen(PORT,'0.0.0.0',()=>console.log(`Anime Island 3D running on ${PORT}`));
