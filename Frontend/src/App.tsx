import './App.css';
import { Layout } from 'antd';
import MainPage from './pages/MainPage';


const { Header, Content, Footer } = Layout;

function App() {
    return (
        <Layout className="app-layout">
            <Header className="app-header-custom">
                <div>
                    <h1>Multimodal RAG System</h1>
                    <p>Your personal AI-powered news retriever</p>
                </div>
            </Header>

            <Content className="app-content-custom">
                <div className="app-content-inner">
                    <MainPage />
                </div>
            </Content>

            <Footer className="app-footer-custom">
                <p>© 2025 RAG System Demo. All Rights Reserved.</p>
            </Footer>
        </Layout>
    );
}

export default App;