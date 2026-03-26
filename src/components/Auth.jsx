import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

export function Auth() {
 const [loading, setLoading] = useState(false);
 const [isLogin, setIsLogin] = useState(true);
 
 // Nossos 3 campos
 const [email, setEmail] = useState('');
 const [password, setPassword] = useState('');
 const [nome, setNome] = useState(''); // <-- O estado do NOME aqui!

 const handleAuth = async (e) => {
   e.preventDefault();
   setLoading(true);

   if (isLogin) {
     // MODO LOGIN
     const { error } = await supabase.auth.signInWithPassword({ email, password });
     if (error) alert("Erro ao entrar: " + error.message);
   } else {
     // MODO CADASTRO
     if (!nome) {
       alert("Preencha o Nome Completo!");
       setLoading(false);
       return;
     }
     
     // Enviando o email, senha e o NOME junto!
     const { error } = await supabase.auth.signUp({
       email,
       password,
       options: {
         data: { nome: nome }
       }
     });
     
     if (error) {
       alert("Erro ao cadastrar: " + error.message);
     } else {
       alert("Conta criada com sucesso! Aguarde a aprovação de um Administrador.");
       setIsLogin(true); // Volta pra tela de login
     }
   }
   setLoading(false);
 };

 return (
   <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f8fafc' }}>
     <div className="card" style={{ width: '100%', maxWidth: '400px', padding: '30px' }}>
       <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>
         {isLogin ? 'Incovia - Acesso' : 'Criar Conta'}
       </h2>
       
       <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
         
         {/* O CAMPO DE NOME: Só aparece quando o cara clica em "Cadastre-se" */}
         {!isLogin && (
           <label className="full-row" style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
             <span style={{ fontSize: '0.875rem', fontWeight: '500', color: '#64748b' }}>Nome Completo</span>
             <input 
               type="text" 
               value={nome} 
               onChange={(e) => setNome(e.target.value)} 
               required 
               style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
             />
           </label>
         )}

         <label className="full-row" style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
           <span style={{ fontSize: '0.875rem', fontWeight: '500', color: '#64748b' }}>E-mail</span>
           <input 
             type="email" 
             value={email} 
             onChange={(e) => setEmail(e.target.value)} 
             required 
             style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
           />
         </label>
         
         <label className="full-row" style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
           <span style={{ fontSize: '0.875rem', fontWeight: '500', color: '#64748b' }}>Senha</span>
           <input 
             type="password" 
             value={password} 
             onChange={(e) => setPassword(e.target.value)} 
             required 
             style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
           />
         </label>

         <button className="primary-btn" type="submit" disabled={loading} style={{ marginTop: '10px' }}>
           {loading ? 'Carregando...' : (isLogin ? 'Entrar' : 'Cadastrar')}
         </button>
       </form>

       <button 
         className="ghost-btn full" 
         onClick={() => setIsLogin(!isLogin)} 
         style={{ marginTop: '15px' }}
       >
         {isLogin ? 'Não tem conta? Cadastre-se' : 'Já tem conta? Faça Login'}
       </button>
     </div>
   </div>
 );
}