import React, { useState } from 'react';
import { supabase } from '../lib/supabase'; // Ajuste o caminho se a sua pasta lib estiver em outro lugar

export function Auth() {
 const [loading, setLoading] = useState(false);
 const [email, setEmail] = useState('');
 const [password, setPassword] = useState('');
 const [message, setMessage] = useState('');

 // Função para Entrar (Login)
 const handleLogin = async (e) => {
   e.preventDefault(); // Evita que a página recarregue
   setLoading(true);
   setMessage('');

   const { error } = await supabase.auth.signInWithPassword({
     email,
     password,
   });

   if (error) {
     setMessage(`Erro: ${error.message}`);
   } else {
     setMessage('Login realizado com sucesso! Bem-vindo.');
   }
   setLoading(false);
 };

 // Função para Cadastrar (Sign Up)
 const handleSignUp = async (e) => {
   e.preventDefault();
   setLoading(true);
   setMessage('');

   const { error } = await supabase.auth.signUp({
     email,
     password,
   });

   if (error) {
     setMessage(`Erro: ${error.message}`);
   } else {
     setMessage('Cadastro realizado! Verifique o painel do Supabase.');
   }
   setLoading(false);
 };

 return (
   <div style={{ maxWidth: '400px', margin: '50px auto', padding: '20px', border: '1px solid #ccc', borderRadius: '8px', fontFamily: 'sans-serif' }}>
     <h2 style={{ textAlign: 'center' }}>Acesso ao Sistema</h2>
     
     <form style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
       <div>
         <label style={{ display: 'block', marginBottom: '5px' }}>E-mail:</label>
         <input
           type="email"
           value={email}
           onChange={(e) => setEmail(e.target.value)}
           style={{ width: '100%', padding: '10px', boxSizing: 'border-box' }}
           placeholder="seu@email.com"
           required
         />
       </div>

       <div>
         <label style={{ display: 'block', marginBottom: '5px' }}>Senha:</label>
         <input
           type="password"
           value={password}
           onChange={(e) => setPassword(e.target.value)}
           style={{ width: '100%', padding: '10px', boxSizing: 'border-box' }}
           placeholder="Mínimo de 6 caracteres"
           required
         />
       </div>
       
       {/* Mostra as mensagens de erro ou sucesso */}
       {message && (
         <div style={{ padding: '10px', backgroundColor: message.includes('Erro') ? '#fee2e2' : '#dcfce7', color: message.includes('Erro') ? '#991b1b' : '#166534', borderRadius: '4px' }}>
           {message}
         </div>
       )}

       <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
         <button onClick={handleLogin} disabled={loading} style={{ flex: 1, padding: '10px', cursor: 'pointer', backgroundColor: '#000', color: '#fff', border: 'none', borderRadius: '4px' }}>
           {loading ? 'Aguarde...' : 'Entrar'}
         </button>
         <button onClick={handleSignUp} disabled={loading} style={{ flex: 1, padding: '10px', cursor: 'pointer', backgroundColor: '#fff', color: '#000', border: '1px solid #000', borderRadius: '4px' }}>
           {loading ? 'Aguarde...' : 'Cadastrar'}
         </button>
       </div>
     </form>
   </div>
 );
}