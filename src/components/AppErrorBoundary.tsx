import { Component, ReactNode } from 'react';
import { Button } from './UiKit';
import { navigate } from '@/router/routes';

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  message?: string;
};

export default class AppErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error?.message || 'Unknown error'
    };
  }

  componentDidCatch(error: Error) {
    console.error('AppErrorBoundary caught error:', error);
  }

  reset = () => {
    this.setState({ hasError: false, message: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        <section className="page-stack">
          <div className="section-panel access-state-panel">
            <h1 style={{ marginBottom: 8 }}>Что-то пошло не так</h1>
            <p className="small" style={{ fontSize: 14 }}>
              Интерфейс перехватил runtime-ошибку и не дал приложению упасть целиком.
            </p>
            {this.state.message && (
              <div className="notice error" style={{ marginTop: 12 }}>
                {this.state.message}
              </div>
            )}
            <div className="row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
              <Button onClick={this.reset}>Попробовать снова</Button>
              <Button variant="ghost" onClick={() => navigate('dashboard')}>К обзору</Button>
            </div>
          </div>
        </section>
      );
    }

    return this.props.children;
  }
}
