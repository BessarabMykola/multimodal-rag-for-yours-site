import React, { useEffect, useState } from 'react';
import { useRAGSearch } from '../../hooks/useRAGSearch.ts';
import { Status } from '../../api/enam/status.enum.ts';
import { Input, Spin, Alert, Empty, Row, Col } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import type { IImage, ILink } from "../../api/interface/rag.interface.ts";
import { Card } from 'antd';

const MainPage: React.FC = () => {
    const { articles, status, error, search } = useRAGSearch();
    const [mainAnswer, setMainAnswer] = useState<string>('');
    const [relatedLinks, setRelatedLinks] = useState<ILink[]>([]);
    const [imageCards, setImageCards] = useState<IImage[]>([]);
    useEffect(() => {
        search('');
    }, [search]);

    useEffect(() => {
        if (status === Status.SUCCESS && articles) {
            setMainAnswer(articles.content);
            setRelatedLinks(articles.links || []);
            setImageCards(articles.images || []);
        } else if (status === Status.SUCCESS && !articles) {
            setMainAnswer('');
            setRelatedLinks([]);
            setImageCards([]);
        }
    }, [articles, status]);

    const handleSearch = (query: string) => {
        search(query);
    };

    const renderLoadingOrError = () => {
        if (status === Status.LOADING) {
            return (
                <div className="flex justify-center items-center py-12">
                    <Spin size="large" tip="Loading data..." />
                </div>
            );
        }
        if (status === Status.ERROR) {
            return error ? (
                <Alert
                    message="Error"
                    description={error}
                    type="error"
                    showIcon
                    className="ant-alert"
                />
            ) : null;
        }
        return null;
    };

    const renderChatAnswer = () => {
        if (mainAnswer) {
            return (
                <Card title="Answer" className="mb-6 shadow-md" style={{ borderRadius: '8px' }}>
                    <p>{mainAnswer}</p>
                </Card>
            );
        }
        return null;
    };

    const renderImageCards = () => {
        if (imageCards.length === 0) {
            return null;
        }

        const getImageColSpan = (totalImages: number, index: number) => {
            const remainder = totalImages % 3;

            if (totalImages === 1) return { xs: 24, sm: 24, md: 24 };
            if (totalImages === 2) return { xs: 24, sm: 12, md: 12 };
            if (totalImages === 3) return { xs: 24, sm: 12, md: 8 };

            if (remainder === 1 && index === totalImages - 1) {
                return { xs: 24, sm: 12, md: 24 };
            }
            if (remainder === 2 && (index === totalImages - 1 || index === totalImages - 2)) {
                return { xs: 24, sm: 12, md: 12 };
            }

            return { xs: 24, sm: 12, md: 8 };
        };


        return (
            <>
                <h3 className="text-lg font-bold mb-3">Images</h3>
                <Row gutter={[16, 16]} align="stretch">
                    {imageCards.map((image, index) => {
                        const colProps = getImageColSpan(imageCards.length, index);
                        return (
                            <Col {...colProps} key={image.id}>
                                <Card
                                    hoverable
                                    className="image-compact-card flex flex-col h-full"
                                    style={{ borderRadius: '8px', overflow: 'hidden' }}
                                    bodyStyle={{ flexGrow: 1 }}
                                    cover={
                                        <a href={image.src} target="_blank" rel="noopener noreferrer">
                                            <img
                                                alt={image.alt}
                                                src={image.src}
                                                style={{ width: '100%', height: 'auto', display: 'block', borderTopLeftRadius: '8px', borderTopRightRadius: '8px' }}
                                            />
                                        </a>
                                    }
                                >
                                    <Card.Meta title={<div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{image.alt}</div>} />
                                </Card>
                            </Col>
                        );
                    })}
                </Row>
            </>
        );
    };

    const renderRelatedLinks = () => {
        if (relatedLinks.length === 0) {
            return null;
        }
        return (
            <>
                <h3 className="text-lg font-bold mb-3">Related Articles</h3>
                <div className="flex flex-col" style={{ gap: '8px' }}>
                    {relatedLinks.map((link, index) => (
                        <Card
                            key={link.url}
                            hoverable
                            className="related-link-card"
                            style={{ borderRadius: '8px' }}
                        >
                            <Card.Meta
                                title={
                                    <a
                                        href={link.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="block text-base text-current hover:underline"
                                        style={{ color: 'inherit' }}
                                    >
                                        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {link.title || `Article ${index + 1}`}
                                        </div>
                                    </a>
                                }
                            />
                        </Card>
                    ))}
                </div>
            </>
        );
    };


    const renderContent = () => {
        if (status === Status.IDLE) {
            return <Empty description="Enter a query to find news." className="py-12" />;
        }

        const loadingOrError = renderLoadingOrError();
        if (loadingOrError) return loadingOrError;

        if (!mainAnswer && relatedLinks.length === 0 && imageCards.length === 0) {
            return <Empty description="No results found for your query." className="py-12" />;
        }

        return (
            <>
                {renderChatAnswer()}
                <Row gutter={[24, 24]} className="mt-6">
                    <Col xs={24} md={16}>
                        {renderImageCards()}
                    </Col>
                    <Col xs={24} md={8}>
                        {renderRelatedLinks()}
                    </Col>
                </Row>
            </>
        );
    };

    return (
        <div className="p-6 max-w-7xl mx-auto min-h-screen flex flex-col">
            <div className="search-input-container mb-8">
                <Input.Search
                    placeholder="Enter your question..."
                    allowClear
                    enterButton={<SearchOutlined />}
                    size="large"
                    onSearch={handleSearch}
                    loading={status === Status.LOADING}
                    disabled={status === Status.LOADING}
                    className="search-bar-custom"
                />
            </div>
            <section className="flex-grow">
                {renderContent()}
            </section>
        </div>
    );
};

export default MainPage;