import { Navigate, Route, Routes } from 'react-router'
import { AppShell } from '@/components/app-shell'
import { AreaLayout } from '@/components/area-layout'
import NotFound from '@/components/not-found'
import { AREAS } from './areas'

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/universe" replace />} />
        {AREAS.map((area) => (
          <Route
            key={area.path}
            path={area.path}
            element={
              <AreaLayout
                label={area.label}
                tabs={area.pages.map((p) => ({
                  to: p.path ? `/${area.path}/${p.path}` : `/${area.path}`,
                  label: p.label,
                  preload: p.load,
                  end: p.path === '',
                }))}
              />
            }
          >
            {area.pages.map(({ path, Component }) =>
              path ? (
                <Route key={path} path={path} element={<Component />} />
              ) : (
                <Route key="index" index element={<Component />} />
              ),
            )}
          </Route>
        ))}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
